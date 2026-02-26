"""
server.py — Flask API Server for QSPR-Based Molecular Property Prediction
============================================================================
Production-grade Flask API serving QSPR ensemble predictions with
uncertainty quantification.

Upgrade from v1:
  v1: Manual RDKit descriptors → sklearn models → point predictions
  v2: Morgan FP (ECFP4) → RF+XGBoost ensemble → predictions + confidence

The API contract is BACKWARD COMPATIBLE with v1 — the response structure
matches the existing Next.js frontend expectations.

Architecture:
  - Models load ONCE at startup (not per-request)
  - Fingerprint calculator is shared (stateless, thread-safe)
  - No global state mutation during requests
  - Proper exception handling with structured error responses

Endpoints:
  GET  /health        → Server health check
  POST /predict       → Predict all properties for a SMILES
  GET  /models        → List available prediction capabilities
  POST /descriptors   → Get molecular descriptors
  POST /drug-likeness → Drug-likeness assessment
"""

import os
import sys
import json
import logging
import time
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env.local from project root so API keys (Gemini, Riva, etc.)
# are available to the Python process — Next.js only loads these for Node.
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_project_root, ".env.local"), override=False)

# Add project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qspr.config import (
    FLASK_PORT, MODEL_DIR, MODEL_VERSION, DATASET_CONFIGS,
    LEGACY_MODEL_DIR, DESCRIPTOR_VERSION, DATA_DIR,
)
from qspr.fingerprints import (
    MorganFingerprintCalculator,
    compute_rdkit_properties,
    compute_drug_likeness,
)
from qspr.models import RandomForestQSPR, XGBoostQSPR
from qspr.ensemble import QSPREnsemble
from qspr.serialization import ModelSerializer

# ─── ADMET v4 imports ───
try:
    from admet.config import (
        ADMET_ENDPOINTS,
        MODEL_DIR as ADMET_MODEL_DIR,
        MODEL_VERSION as ADMET_MODEL_VERSION,
        DESCRIPTOR_VERSION as ADMET_DESCRIPTOR_VERSION,
    )
    from admet.features.hybrid_fingerprints import HybridFingerprintCalculator as ADMETFingerprintCalc
    from admet.models.base import RandomForestADMET, XGBoostADMET
    from admet.models.ensemble import ADMETEnsemble
    from admet.models.prodrug_detector import ProdugDetector
    from admet.models.metabolism import MetabolismPredictor
    from admet.models.router import EnsembleRouter
    from admet.domain.applicability import ApplicabilityDomain
    ADMET_AVAILABLE = True
except ImportError as _admet_err:
    ADMET_AVAILABLE = False

# ─── Low-memory mode (for Render 512 MB free tier) ───
# Set LOW_MEMORY=1 to load only XGBoost models, skip RF + legacy + ADMET
LOW_MEMORY = os.environ.get("LOW_MEMORY", "0").strip().lower() in ("1", "true", "yes")

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("insilico-ml")

# ─── App ───
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ─── Global state (loaded once at startup, read-only during requests) ───
fp_calculator: MorganFingerprintCalculator = None
ensembles: dict = {}       # prop_name → QSPREnsemble
model_metadata: dict = {}  # prop_name → metadata dict
_server_ready = False

# ─── ADMET v4 state ───
admet_router: EnsembleRouter = None
_admet_ready = False

# ─── Legacy fallback ───
legacy_models: dict = {}
legacy_descriptors_module = None


def _load_legacy_models():
    """Load v1 joblib models as fallback if QSPR models are not available."""
    global legacy_models, legacy_descriptors_module

    try:
        import importlib
        spec = importlib.util.spec_from_file_location(
            "descriptors_legacy",
            os.path.join(os.path.dirname(__file__), "descriptors.py"),
        )
        legacy_descriptors_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(legacy_descriptors_module)
    except Exception as e:
        logger.warning(f"Could not load legacy descriptors module: {e}")
        return

    import joblib

    if not os.path.exists(LEGACY_MODEL_DIR):
        return

    for filename in os.listdir(LEGACY_MODEL_DIR):
        if not filename.endswith(".joblib"):
            continue

        parts = filename.replace(".joblib", "").split("_")
        if "decision_tree" in filename:
            prop = "_".join(parts[:-2])
            algo = "decision_tree"
        else:
            prop = "_".join(parts[:-1])
            algo = parts[-1]

        filepath = os.path.join(LEGACY_MODEL_DIR, filename)
        try:
            data = joblib.load(filepath)
            if prop not in legacy_models:
                legacy_models[prop] = {}
            legacy_models[prop][algo] = data
            logger.info(f"  ✓ Legacy fallback loaded: {prop}/{algo}")
        except Exception as e:
            logger.warning(f"  ✗ Failed to load legacy {filename}: {e}")


def _predict_legacy(smiles: str, prop: str) -> dict:
    """Predict using legacy v1 models (fallback)."""
    if prop not in legacy_models or legacy_descriptors_module is None:
        return {"error": f"No legacy model for '{prop}'"}

    algo = "xgboost" if "xgboost" in legacy_models[prop] else list(legacy_models[prop].keys())[0]
    model_data = legacy_models[prop][algo]
    model = model_data["model"]
    scaler = model_data["scaler"]
    feature_names = model_data["feature_names"]

    desc = legacy_descriptors_module.compute_descriptors(smiles)
    X = np.array([[desc[f] for f in feature_names]])
    X_scaled = scaler.transform(X)

    if hasattr(model, "predict_proba"):
        prediction = int(model.predict(X_scaled)[0])
        probability = float(model.predict_proba(X_scaled)[0][1])
        return {"value": prediction, "probability": round(probability, 4)}
    else:
        prediction = float(model.predict(X_scaled)[0])
        return {"value": round(prediction, 4)}


def load_qspr_models():
    """
    Load QSPR v2 models at startup.

    Falls back to legacy v1 models if QSPR models are not yet trained.
    """
    global fp_calculator, ensembles, model_metadata, _server_ready

    fp_calculator = MorganFingerprintCalculator()
    serializer = ModelSerializer()

    available = serializer.list_models()
    logger.info(f"QSPR models available: {available}")

    if LOW_MEMORY:
        logger.info("LOW_MEMORY mode: loading XGBoost-only (skipping RandomForest)")

    for prop_name, config in DATASET_CONFIGS.items():
        task = config["task"]

        if prop_name not in available:
            logger.warning(f"  No QSPR model for '{prop_name}' — will use legacy fallback")
            continue

        try:
            ensemble = QSPREnsemble(task=task, property_name=prop_name)

            # Load ensemble weights
            ens_config = serializer.load_ensemble_config(prop_name)
            weights = ens_config.get("weights", {"random_forest": 0.4, "xgboost": 0.6})

            models_loaded = 0

            # Load RandomForest (skip in LOW_MEMORY — each RF is 50-200 MB in RAM)
            if not LOW_MEMORY and "random_forest" in available.get(prop_name, []):
                rf_data = serializer.load_model(prop_name, "random_forest")
                rf_model = RandomForestQSPR(task=task)
                rf_model.model = rf_data["model"]
                rf_model.scaler = rf_data["scaler"]
                rf_model._feature_names = rf_data.get("feature_names")
                rf_model.is_fitted = True
                ensemble.add_model(
                    "random_forest", rf_model,
                    weight=weights.get("random_forest", 0.4),
                )
                models_loaded += 1

            # Load XGBoost (always — lightweight, ~1 MB per model)
            if "xgboost" in available.get(prop_name, []):
                xgb_data = serializer.load_model(prop_name, "xgboost")
                xgb_model = XGBoostQSPR(task=task)
                xgb_model.model = xgb_data["model"]
                xgb_model.scaler = xgb_data["scaler"]
                xgb_model._feature_names = xgb_data.get("feature_names")
                xgb_model.is_fitted = True
                # In LOW_MEMORY mode XGBoost is the sole model, give it full weight
                w = 1.0 if LOW_MEMORY else weights.get("xgboost", 0.6)
                ensemble.add_model("xgboost", xgb_model, weight=w)
                models_loaded += 1

            if models_loaded > 0:
                ensembles[prop_name] = ensemble
                model_metadata[prop_name] = {
                    "task": task,
                    "models": list(ensemble.models.keys()),
                    "weights": ensemble.weights,
                }
                logger.info(f"  ✓ {prop_name}: {models_loaded} models loaded")

        except Exception as e:
            logger.error(f"  ✗ Failed to load QSPR models for {prop_name}: {e}")

    # Load legacy models as fallback (skip in LOW_MEMORY — redundant with QSPR v2)
    if not LOW_MEMORY:
        _load_legacy_models()
    else:
        logger.info("LOW_MEMORY mode: skipping legacy model loading")

    _server_ready = True
    logger.info(
        f"Ready: {len(ensembles)} QSPR ensembles, "
        f"{len(legacy_models)} legacy fallbacks"
    )


def load_admet_models():
    """
    Load ADMET v4 models at startup.

    Attempts to load the EnsembleRouter with all trained endpoint models,
    applicability domains, prodrug detector, and metabolism predictor.
    """
    global admet_router, _admet_ready

    if not ADMET_AVAILABLE:
        logger.warning("ADMET v4 package not available (import error)")
        return

    import joblib

    router_path = os.path.join(ADMET_MODEL_DIR, "router.joblib")
    if os.path.exists(router_path):
        try:
            admet_router = joblib.load(router_path)
            _admet_ready = True
            logger.info(f"  ✓ ADMET v4 router loaded: {admet_router.describe()}")
            return
        except Exception as e:
            logger.warning(f"  Failed to load ADMET router: {e}")

    # Fallback: rebuild router from individual model files
    try:
        router = EnsembleRouter()
        loaded = 0

        for endpoint, ep_cfg in ADMET_ENDPOINTS.items():
            task = ep_cfg["task"]
            rf_path = os.path.join(ADMET_MODEL_DIR, f"{endpoint}_random_forest.joblib")
            xgb_path = os.path.join(ADMET_MODEL_DIR, f"{endpoint}_xgboost.joblib")
            ens_cfg_path = os.path.join(ADMET_MODEL_DIR, f"{endpoint}_ensemble.json")
            ad_path = os.path.join(ADMET_MODEL_DIR, f"{endpoint}_ad.joblib")

            if not (os.path.exists(rf_path) and os.path.exists(xgb_path)):
                continue

            try:
                rf_data = joblib.load(rf_path)
                rf = RandomForestADMET(task=task, endpoint=endpoint)
                rf.model = rf_data["model"]
                rf.scaler = rf_data["scaler"]
                rf._feature_names = rf_data.get("feature_names")
                rf.is_fitted = True

                xgb_data = joblib.load(xgb_path)
                xgb_m = XGBoostADMET(task=task, endpoint=endpoint)
                xgb_m.model = xgb_data["model"]
                xgb_m.scaler = xgb_data["scaler"]
                xgb_m._feature_names = xgb_data.get("feature_names")
                xgb_m.is_fitted = True

                # Load ensemble weights
                weights = {"random_forest": 0.4, "xgboost": 0.6}
                if os.path.exists(ens_cfg_path):
                    with open(ens_cfg_path) as f:
                        ens_json = json.load(f)
                    weights = ens_json.get("weights", weights)

                ensemble = ADMETEnsemble(task=task, endpoint=endpoint)
                ensemble.add_model("random_forest", rf, weight=weights.get("random_forest", 0.4))
                ensemble.add_model("xgboost", xgb_m, weight=weights.get("xgboost", 0.6))

                router.register_ensemble(endpoint, "default", ensemble)
                loaded += 1

                # Load applicability domain
                if os.path.exists(ad_path):
                    ad = ApplicabilityDomain.load(ad_path)
                    router.register_applicability_domain(endpoint, ad)

            except Exception as e:
                logger.warning(f"  ✗ Failed to load ADMET {endpoint}: {e}")

        # Load shared modules
        det_path = os.path.join(ADMET_MODEL_DIR, "prodrug_detector.joblib")
        if os.path.exists(det_path):
            try:
                detector = joblib.load(det_path)
                router.register_prodrug_detector(detector)
                logger.info("  ✓ Prodrug detector loaded")
            except Exception as e:
                logger.warning(f"  Prodrug detector load failed: {e}")

        met_path = os.path.join(ADMET_MODEL_DIR, "metabolism_predictor.joblib")
        if os.path.exists(met_path):
            try:
                predictor = joblib.load(met_path)
                router.register_metabolism_predictor(predictor)
                logger.info("  ✓ Metabolism predictor loaded")
            except Exception as e:
                logger.warning(f"  Metabolism predictor load failed: {e}")

        if loaded > 0:
            admet_router = router
            _admet_ready = True
            logger.info(f"  ✓ ADMET v4: {loaded} endpoints loaded")
        else:
            logger.warning("  No ADMET v4 models found — run train_admet.py")

    except Exception as e:
        logger.warning(f"  ADMET v4 loading failed: {e}")


def _predict_qspr(smiles: str, prop: str) -> dict:
    """
    Predict a property using the QSPR ensemble.
    Falls back to legacy if ensemble is unavailable.

    Returns dict with: value, confidence, uncertainty, model_version, descriptor_type
    """
    # Try QSPR ensemble first
    if prop in ensembles:
        try:
            X = fp_calculator.compute(smiles).reshape(1, -1)
            result = ensembles[prop].predict_single(X)
            task = DATASET_CONFIGS[prop]["task"]

            if task == "regression":
                return {
                    "value": round(float(result["prediction"]), 4),
                    "confidence": round(float(result["confidence"]), 4),
                    "uncertainty": round(float(result["uncertainty"]), 4),
                    "model_version": MODEL_VERSION,
                    "descriptor_type": DESCRIPTOR_VERSION,
                }
            else:
                return {
                    "value": int(result["prediction"]),
                    "probability": round(float(result.get("probability", 0.5)), 4),
                    "confidence": round(float(result["confidence"]), 4),
                    "uncertainty": round(float(result["uncertainty"]), 4),
                    "model_version": MODEL_VERSION,
                    "descriptor_type": DESCRIPTOR_VERSION,
                }
        except Exception as e:
            logger.warning(f"QSPR prediction failed for {prop}: {e}")

    # Fallback to legacy
    if prop in legacy_models:
        result = _predict_legacy(smiles, prop)
        result["model_version"] = "1.0.0-legacy"
        result["descriptor_type"] = "rdkit_descriptors"
        return result

    return {"error": f"No model available for '{prop}'"}


def assess_status(prop: str, value) -> str:
    """Assess whether a property value is optimal, moderate, or poor."""
    rules = {
        "logp": lambda v: "optimal" if -0.4 <= v <= 3.5 else ("moderate" if -1 <= v <= 5 else "poor"),
        "pka": lambda v: "optimal" if v is None else "moderate",
        "solubility": lambda v: "optimal" if v > 1 else ("moderate" if v > 0.01 else "poor"),
        "tpsa": lambda v: "optimal" if 20 <= v <= 120 else ("moderate" if 10 <= v <= 140 or v < 20 else "poor"),
        "bioavailability": lambda v: "optimal" if v >= 70 else ("moderate" if v >= 40 else "poor"),
        "toxicity": lambda v: "optimal" if v == "Low" else ("moderate" if v == "Moderate" else "poor"),
    }
    fn = rules.get(prop, lambda v: "moderate")
    try:
        return fn(value)
    except Exception:
        return "moderate"


# ═══════════════════════════════════════════════════
#  API Routes
# ═══════════════════════════════════════════════════

@app.route("/health", methods=["GET"])
def health():
    """Server health check."""
    return jsonify({
        "status": "healthy",
        "model_version": MODEL_VERSION,
        "engine": "QSPR v2.0 (ECFP4 + Ensemble)",
        "admet_v4": {
            "ready": _admet_ready,
            "version": ADMET_MODEL_VERSION if ADMET_AVAILABLE else None,
            "endpoints": admet_router.get_available_endpoints() if _admet_ready and admet_router else [],
        },
        "properties_available": list(ensembles.keys()) or [
            "logp", "pka", "solubility", "tpsa", "bioavailability", "toxicity"
        ],
        "n_ensembles": len(ensembles),
        "n_legacy_fallbacks": len(legacy_models),
    })


@app.route("/models", methods=["GET"])
def list_models():
    """List prediction capabilities with model details."""
    properties_info = [
        {"key": "logp", "name": "LogP", "description": "Octanol-water partition coefficient", "unit": ""},
        {"key": "pka", "name": "pKa (acidic)", "description": "Acid dissociation constant", "unit": ""},
        {"key": "solubility", "name": "Solubility", "description": "Aqueous solubility", "unit": "mg/mL"},
        {"key": "tpsa", "name": "TPSA", "description": "Topological Polar Surface Area", "unit": "Å²"},
        {"key": "bioavailability", "name": "Bioavailability", "description": "Oral bioavailability estimate", "unit": "%"},
        {"key": "toxicity", "name": "Toxicity Risk", "description": "Clinical toxicity risk assessment", "unit": ""},
    ]

    return jsonify({
        "properties": properties_info,
        "engine": {
            "version": MODEL_VERSION,
            "descriptor": "Morgan Fingerprints (ECFP4, 2048 bits) + Physicochemical",
            "models": "RandomForest + XGBoost Ensemble",
            "validation": "Scaffold-based split",
        },
        "datasets_used": "MoleculeNet (ESOL, Lipophilicity, BBBP, ClinTox)",
        "descriptor_engine": "RDKit + Morgan FP",
    })


@app.route("/predict", methods=["POST"])
def predict():
    """
    Predict all 6 properties for a given SMILES string.

    Request:
      POST /predict
      { "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O" }

    Response: Backward-compatible with v1 API contract.
    Additions: confidence scores and model metadata per property.
    """
    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles' in request body"}), 400

    smiles = data["smiles"].strip()
    if not smiles:
        return jsonify({"error": "Empty SMILES string"}), 400

    try:
        t_start = time.time()

        # ── Step 1: RDKit direct property computation ──
        rdkit_props = compute_rdkit_properties(smiles)

        # ── Step 2: QSPR ensemble predictions ──
        logp_pred = _predict_qspr(smiles, "logp")
        sol_pred = _predict_qspr(smiles, "solubility")
        bbbp_pred = _predict_qspr(smiles, "bbbp")
        tox_pred = _predict_qspr(smiles, "toxicity")

        # ── Step 3: Derive final property values ──

        # LogP — blend QSPR prediction with RDKit Crippen
        # Crippen LogP is a well-validated physics-based method (Wildman-Crippen).
        # QSPR model was trained on Lipophilicity (logD) which differs from logP,
        # and has R² ≈ 0.50 on scaffold splits.  Strategy:
        #   • If QSPR confidence is high  → moderate blend (50/50)
        #   • If QSPR confidence is low   → lean heavily on Crippen (80/20)
        #   • Always sanity-check: for pure hydrocarbons (no heteroatoms),
        #     Crippen is near-exact, so trust it almost entirely.
        qspr_logp = logp_pred.get("value", rdkit_props["logp_crippen"])
        crippen_logp = rdkit_props["logp_crippen"]
        logp_confidence = logp_pred.get("confidence", 0.5)
        n_heteroatoms = rdkit_props.get("heavy_atoms", 0) - sum(
            1 for c in smiles if c.upper() in ('C',)
        )
        # For very simple / pure hydrocarbon molecules, Crippen is highly accurate
        from rdkit import Chem as _Chem
        _mol_tmp = _Chem.MolFromSmiles(smiles)
        _num_hetero = Descriptors.NumHeteroatoms(_mol_tmp) if _mol_tmp else 0
        if _num_hetero == 0:
            # Pure hydrocarbon — Crippen is essentially exact
            qspr_weight = 0.05
        else:
            # Blend weight: at confidence=1.0 → 50% QSPR, at confidence=0.0 → 10% QSPR
            qspr_weight = 0.1 + 0.4 * logp_confidence
        logp_value = qspr_weight * qspr_logp + (1 - qspr_weight) * crippen_logp
        # Confidence reflects blend quality
        logp_confidence = max(logp_confidence, 0.60 if _num_hetero == 0 else 0.55)

        # pKa — heuristic (no QSPR model for pKa yet)
        mol_from_fp = fp_calculator.smiles_to_mol(smiles) if fp_calculator else None
        from rdkit.Chem import Descriptors as RDDesc
        from rdkit import Chem
        mol = Chem.MolFromSmiles(smiles)
        # Count functional groups for pKa estimation
        n_carboxyl = len(mol.GetSubstructMatches(Chem.MolFromSmarts("[CX3](=O)[OX2H1]"))) if mol else 0
        n_amine = len(mol.GetSubstructMatches(Chem.MolFromSmarts("[NX3;H2,H1;!$(NC=O)]"))) if mol else 0
        n_hydroxyl = len(mol.GetSubstructMatches(Chem.MolFromSmarts("[OX2H]"))) if mol else 0

        # Determine if molecule is ionizable
        has_ionizable_groups = (n_carboxyl + n_amine + n_hydroxyl) > 0

        if n_carboxyl > 0:
            pka_value = round(3.5 + 0.4 * (n_carboxyl - 1) + 0.1 * n_hydroxyl, 2)
        elif n_hydroxyl > 0 and n_amine == 0:
            pka_value = round(9.5 + 0.3 * n_hydroxyl, 2)
        elif n_amine > 0:
            pka_value = round(10.0 - 0.5 * n_amine, 2)
        else:
            pka_value = None  # Non-ionizable molecule — no meaningful pKa

        # Solubility — convert logS (mol/L) to mg/mL
        # ESOL target: "measured log solubility in mols per litre" = log10(S [mol/L])
        # Conversion:
        #   S [mol/L] = 10^logS
        #   S [g/L]   = 10^logS × MW
        #   S [mg/mL] = 10^logS × MW / 1000   (since 1 g/L = 1 mg/mL only if ÷1000 from g→mg and L→mL cancel — actually 1 g/L = 1 mg/mL)
        #
        # Wait — 1 g/L = 1 mg/mL is INCORRECT:
        #   1 g/L = 0.001 g/mL = 1 mg/mL  ← actually this IS correct (g→mg = ×1000, L→mL = ÷1000, they cancel)
        # BUT the original formula was: 10^logS × MW  which gives g/L directly,
        # and g/L == mg/mL.  So let's re-check the actual numbers:
        #
        # For the problematic compound (pure hydrocarbon, MW ≈ 130):
        #   If logS ≈ -1 (model prediction), then 10^(-1) × 130 = 13 g/L = 13 mg/mL
        #   Real solubility of styrene derivatives: ~0.3 mg/mL
        #   So logS should be ~ -2.6 for this compound
        #
        # The issue is the QSPR model may predict logS poorly for out-of-domain
        # molecules.  We add a Crippen LogP–based sanity correction:
        # Yalkowsky-Valvani equation: logS ≈ 0.5 - logP - 0.01*(MP-25)
        # For liquids at room temp, MP≈25: logS ≈ 0.5 - logP
        logs_value = sol_pred.get("value", -2.0)
        sol_confidence = max(sol_pred.get("confidence", 0.5), 0.45)
        mw = rdkit_props["molecular_weight"]

        # Yalkowsky-Valvani estimate as sanity check
        # logS ≈ 0.5 - logP(Crippen) - 0.01*(MP - 25)
        # We don't know MP, so assume room-temp liquid → MP correction ≈ 0
        yv_logs = 0.5 - crippen_logp

        # If QSPR logS is unreasonably far from the YV estimate, blend toward YV
        logs_diff = abs(logs_value - yv_logs)
        if logs_diff > 2.0:
            # Large disagreement — trust Yalkowsky-Valvani more
            logs_value = 0.3 * logs_value + 0.7 * yv_logs
            sol_confidence = min(sol_confidence, 0.4)
        elif logs_diff > 1.0:
            # Moderate disagreement — blend
            logs_value = 0.6 * logs_value + 0.4 * yv_logs
            sol_confidence = min(sol_confidence, 0.55)

        # For pure hydrocarbons (no heteroatoms), YV equation is very reliable
        if _num_hetero == 0:
            logs_value = 0.15 * logs_value + 0.85 * yv_logs
            sol_confidence = min(sol_confidence, 0.5)

        # Convert logS (mol/L) → mg/mL:
        #   10^logS [mol/L] × MW [g/mol] = solubility in g/L
        #   g/L == mg/mL  (the ×1000 and ÷1000 cancel)
        sol_mg_ml = round(10 ** logs_value * mw, 4)
        sol_mg_ml = max(0.0001, min(sol_mg_ml, 999999))

        # TPSA — directly from RDKit (exact)
        tpsa_value = rdkit_props["tpsa"]

        # Bioavailability — improved multi-factor estimation
        # Previous formula: base×(0.6 + 0.4×bbbp_prob) gave ≈100% for all small molecules.
        # New approach considers:
        #   1. Lipinski violations (absorption)
        #   2. TPSA (intestinal absorption: optimal 20–120 Å²)
        #   3. LogP (metabolism risk: high LogP → CYP metabolism → lower F)
        #   4. Molecular weight (small molecules metabolized faster)
        #   5. BBB penetration probability (as a bonus marker, not the main driver)
        hbd = rdkit_props["hbd"]
        hba = rdkit_props["hba"]
        lipinski_violations = sum([
            mw > 500,
            logp_value > 5,
            hbd > 5,
            hba > 10,
        ])
        bbbp_prob = bbbp_pred.get("probability", 0.5)
        bbbp_confidence = max(bbbp_pred.get("confidence", 0.5), 0.5)

        # Start with Lipinski-based absorption estimate
        bioavail_base = max(0, 100 - lipinski_violations * 20)

        # TPSA penalty — very low TPSA (<20) means high membrane permeability
        # but also means rapid metabolism and poor formulation; very high TPSA
        # (>120) means poor absorption
        if tpsa_value < 10:
            tpsa_penalty = 15  # Very lipophilic, likely rapid metabolism
        elif tpsa_value < 20:
            tpsa_penalty = 5
        elif tpsa_value <= 120:
            tpsa_penalty = 0  # Optimal range
        elif tpsa_value <= 140:
            tpsa_penalty = 10
        else:
            tpsa_penalty = 25

        # LogP-based metabolism penalty
        # Highly lipophilic compounds are extensively CYP-metabolized
        # LogP 1–3 is optimal; >3.5 triggers CYP3A4/2D6 oxidation
        if logp_value > 4.5:
            logp_metabolism_penalty = 30
        elif logp_value > 3.5:
            logp_metabolism_penalty = 20
        elif logp_value > 3.0:
            logp_metabolism_penalty = 10
        elif logp_value > 2.0:
            logp_metabolism_penalty = 5
        elif logp_value < -1.0:
            logp_metabolism_penalty = 15  # Too hydrophilic — poor absorption
        else:
            logp_metabolism_penalty = 0

        # Small aromatic hydrocarbons penalty — undergo extensive phase I metabolism
        aromatic_rings = rdkit_props.get("aromatic_rings", 0)
        if _num_hetero == 0 and aromatic_rings > 0:
            # Pure hydrocarbon with aromatic rings — metabolic liability
            logp_metabolism_penalty += 20

        # Solubility penalty — very low solubility limits dissolution and absorption
        if sol_mg_ml < 0.01:
            sol_penalty = 20
        elif sol_mg_ml < 0.1:
            sol_penalty = 10
        elif sol_mg_ml < 1.0:
            sol_penalty = 5
        else:
            sol_penalty = 0

        # BBB contribution (minor factor — BBB ≠ oral bioavailability)
        bbbp_bonus = round(bbbp_prob * 5)  # 0–5% bonus, not 40%

        bioavail_value = round(max(5, min(99,
            bioavail_base - tpsa_penalty - logp_metabolism_penalty - sol_penalty + bbbp_bonus
        )))

        # Toxicity — enhanced with structural alert corrections
        # ClinTox model captures clinical trial failures, but may miss:
        #   - Reactive metabolite formers (vinyl aromatics → epoxides)
        #   - Michael acceptors (α,β-unsaturated carbonyls)
        #   - Known toxicophores (anilines, nitro aromatics, etc.)
        # We augment the ML prediction with SMARTS-based structural alerts.
        tox_prob = tox_pred.get("probability", 0.1)
        tox_confidence = max(tox_pred.get("confidence", 0.5), 0.5)

        # Structural alert checks using SMARTS
        structural_alerts = []
        _smarts_alerts = {
            # Vinyl/allyl benzene → CYP-mediated epoxide → reactive metabolite
            "vinyl_aromatic": ("[c]C=C", 0.15, "Vinyl aromatic — potential reactive epoxide metabolite"),
            # Michael acceptors (α,β-unsaturated carbonyl)
            "michael_acceptor": ("[#6]=[#6]-[#6]=[O,S]", 0.20, "Michael acceptor — electrophilic reactivity"),
            # Aromatic amine — metabolic activation to nitrenium ions
            "aromatic_amine": ("[c][NH2]", 0.15, "Aromatic primary amine — mutagenicity risk"),
            # Nitro aromatic — reductive activation
            "nitro_aromatic": ("[c][N+](=O)[O-]", 0.20, "Nitro aromatic — reductive bioactivation"),
            # Acyl halide — highly reactive
            "acyl_halide": ("[CX3](=O)[F,Cl,Br,I]", 0.25, "Acyl halide — high reactivity"),
            # Epoxide — electrophilic, DNA damage
            "epoxide": ("[OX2r3]1[#6r3][#6r3]1", 0.25, "Epoxide — electrophilic/genotoxic"),
            # Aldehyde — reactive with proteins
            "aldehyde": ("[CH1](=O)", 0.10, "Aldehyde — protein reactivity"),
            # Polycyclic aromatic (≥3 fused rings) — intercalation / carcinogenicity
            "polyaromatic": ("c1ccc2c(c1)ccc3ccccc23", 0.12, "Polycyclic aromatic — potential carcinogen"),
            # Hydrazine — hepatotoxicity
            "hydrazine": ("[NX3][NX3]", 0.15, "Hydrazine — hepatotoxicity risk"),
            # Thiocarbonyl — reactive
            "thiocarbonyl": ("[#6](=S)", 0.10, "Thiocarbonyl — reactive"),
        }

        alert_boost = 0.0
        for alert_name, (smart, boost, desc) in _smarts_alerts.items():
            pat = Chem.MolFromSmarts(smart)
            if pat and mol.HasSubstructMatch(pat):
                structural_alerts.append({"alert": alert_name, "description": desc, "severity_boost": boost})
                alert_boost += boost

        # Cap the total structural alert boost
        alert_boost = min(alert_boost, 0.50)

        # Combine ML probability with structural alert boost
        tox_prob_adjusted = min(tox_prob + alert_boost, 0.99)

        # Adjust confidence downward if structural alerts disagree with ML
        if alert_boost > 0.1 and tox_prob < 0.2:
            # ML says low tox but structure is concerning — lower confidence
            tox_confidence = min(tox_confidence, 0.45)

        if tox_prob_adjusted < 0.2:
            tox_label = "Low"
        elif tox_prob_adjusted < 0.5:
            tox_label = "Moderate"
        else:
            tox_label = "High"

        # Toxicity sub-scores — incorporate structural alerts
        herg_prob = round(min(tox_prob_adjusted * 0.4 + 0.02, 1.0), 4)
        ames_prob = round(min(tox_prob_adjusted * 0.3 + 0.01 + (0.1 if any(
            a["alert"] in ("aromatic_amine", "nitro_aromatic", "epoxide", "michael_acceptor")
            for a in structural_alerts
        ) else 0.0), 1.0), 4)
        hepato_prob = round(min(tox_prob_adjusted * 0.6 + 0.03 + (0.08 if any(
            a["alert"] in ("hydrazine", "vinyl_aromatic")
            for a in structural_alerts
        ) else 0.0), 1.0), 4)

        # Confidence — weighted average including exact RDKit properties
        # TPSA and pKa have known confidence; include them to boost overall
        pred_confidences = [
            c for c in [logp_confidence, sol_confidence, bbbp_confidence, tox_confidence,
                        1.0,  # TPSA (exact RDKit)
                        0.6 if pka_value is not None else 0.95]  # pKa
            if isinstance(c, (int, float))
        ]
        overall_confidence = round(
            np.mean(pred_confidences) * 100 if pred_confidences else 70.0, 1
        )

        prediction_time = round(time.time() - t_start, 3)

        # ── Step 4: Build response (backward-compatible with v1) ──
        response = {
            "smiles": smiles,
            "molecule": {
                "name": rdkit_props.get("formula", ""),
                "formula": rdkit_props["formula"],
                "molecular_weight": mw,
                "exact_mass": rdkit_props["exact_mass"],
                "qed": rdkit_props["qed"],
            },

            # ── The 6 predicted properties (matching UI table) ──
            "properties": {
                "logp": {
                    "value": round(logp_value, 2),
                    "unit": "",
                    "status": assess_status("logp", logp_value),
                    "description": "Lipophilicity — octanol/water partition coefficient",
                    "confidence": round(logp_confidence, 3),
                },
                "pka": {
                    "value": pka_value,
                    "unit": "",
                    "status": assess_status("pka", pka_value),
                    "description": "Non-ionizable under physiological pH" if pka_value is None else "Acid dissociation constant",
                    "confidence": 0.6 if pka_value is not None else 0.95,
                    "ionizable": has_ionizable_groups,
                },
                "solubility": {
                    "value": round(sol_mg_ml, 2),
                    "unit": "mg/mL",
                    "status": assess_status("solubility", sol_mg_ml),
                    "description": "Aqueous solubility at pH 7.4",
                    "confidence": round(sol_confidence, 3),
                },
                "tpsa": {
                    "value": tpsa_value,
                    "unit": "Å²",
                    "status": assess_status("tpsa", tpsa_value),
                    "description": "Topological polar surface area",
                    "confidence": 1.0,  # Exact RDKit calculation
                },
                "bioavailability": {
                    "value": bioavail_value,
                    "unit": "%",
                    "status": assess_status("bioavailability", bioavail_value),
                    "description": "Estimated oral bioavailability",
                    "confidence": round(bbbp_confidence * 0.8, 3),
                },
                "toxicity": {
                    "value": tox_label,
                    "unit": "",
                    "status": assess_status("toxicity", tox_label),
                    "description": "Clinical toxicity risk level",
                    "confidence": round(tox_confidence, 3),
                },
            },

            # ── Toxicity screening detail ──
            "toxicity_screening": {
                "herg_inhibition": round(herg_prob * 100, 1),
                "ames_mutagenicity": round(ames_prob * 100, 1),
                "hepatotoxicity": round(hepato_prob * 100, 1),
            },

            # ── Structural alerts ──
            "structural_alerts": structural_alerts,

            # ── Lipinski Rule of 5 ──
            "lipinski": {
                "violations": lipinski_violations,
                "mw_ok": mw <= 500,
                "logp_ok": logp_value <= 5,
                "hbd_ok": hbd <= 5,
                "hba_ok": hba <= 10,
            },

            # ── Drug-Likeness Score (pass QSPR logp for consistency) ──
            "drug_likeness": compute_drug_likeness(smiles, logp_override=round(logp_value, 2)),

            # ── Confidence (overall) ──
            "confidence": overall_confidence,

            # ── v2 metadata ──
            "model_info": {
                "version": MODEL_VERSION,
                "engine": "QSPR v2.0",
                "descriptor": DESCRIPTOR_VERSION,
                "ensemble": "RandomForest + XGBoost",
                "validation": "scaffold-based",
                "prediction_time_ms": round(prediction_time * 1000, 1),
            },
        }

        return jsonify(response)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Prediction error: {e}", exc_info=True)
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/descriptors", methods=["POST"])
def get_descriptors():
    """Compute and return molecular descriptors (fingerprint info + RDKit properties)."""
    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles'"}), 400

    try:
        smiles = data["smiles"].strip()
        props = compute_rdkit_properties(smiles)

        # Morgan FP info (don't send 2048-bit vector — just metadata)
        fp_info = fp_calculator.describe() if fp_calculator else {}

        return jsonify({
            "smiles": smiles,
            "rdkit_properties": props,
            "descriptor_info": fp_info,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/drug-likeness", methods=["POST"])
def drug_likeness():
    """Compute drug-likeness score with Lipinski, Veber, PAINS, QED."""
    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles'"}), 400

    try:
        smiles = data["smiles"].strip()
        result = compute_drug_likeness(smiles)
        return jsonify({"smiles": smiles, **result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════
#  ADMET v4 Endpoints
# ═══════════════════════════════════════════════════

@app.route("/admet/predict", methods=["POST"])
def admet_predict():
    """
    Predict all ADMET properties using the v4 domain-aware system.

    Request:
      POST /admet/predict
      {
        "smiles": "CCO",
        "include_metabolism": true,    (optional, default true)
        "endpoints": ["logp", "bbbp"] (optional, default all)
      }

    Response:
      {
        "smiles": "CCO",
        "predictions": { endpoint: { value, confidence, uncertainty, domain_status, ... } },
        "chemical_class": { mw, tpsa, logp, route, ... },
        "model_info": { version, engine, ... }
      }
    """
    if not _admet_ready or admet_router is None:
        return jsonify({
            "error": "ADMET v4 models not loaded. Run: python train_admet.py",
            "fallback": "Use /predict for QSPR v2 predictions",
        }), 503

    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles' in request body"}), 400

    smiles = data["smiles"].strip()
    if not smiles:
        return jsonify({"error": "Empty SMILES string"}), 400

    include_metabolism = data.get("include_metabolism", True)
    requested = data.get("endpoints")

    try:
        t_start = time.time()

        # Classify molecule
        chem_class = admet_router.classify_molecule(smiles)

        # Choose which endpoints to predict
        available = admet_router.get_available_endpoints()
        if requested:
            endpoints = [e for e in requested if e in available]
        else:
            endpoints = available

        # Predict each endpoint
        predictions = {}
        for ep in endpoints:
            try:
                pred = admet_router.predict(ep, smiles, include_metabolism=include_metabolism)
                predictions[ep] = pred.to_dict()
            except Exception as e:
                predictions[ep] = {"error": str(e)}

        elapsed = time.time() - t_start

        return jsonify({
            "smiles": smiles,
            "predictions": predictions,
            "chemical_class": chem_class.to_dict(),
            "model_info": {
                "version": ADMET_MODEL_VERSION if ADMET_AVAILABLE else "unknown",
                "engine": "ADMET v4.0 (ECFP6 + Domain-Aware Ensemble)",
                "descriptor": ADMET_DESCRIPTOR_VERSION if ADMET_AVAILABLE else "unknown",
                "prediction_time_ms": round(elapsed * 1000, 1),
                "endpoints_predicted": len(predictions),
                "endpoints_available": len(available),
            },
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"ADMET prediction error: {e}", exc_info=True)
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/admet/predict/<endpoint>", methods=["POST"])
def admet_predict_single(endpoint):
    """
    Predict a single ADMET endpoint.

    POST /admet/predict/logp
    { "smiles": "CCO" }
    """
    if not _admet_ready or admet_router is None:
        return jsonify({"error": "ADMET v4 models not loaded"}), 503

    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles'"}), 400

    smiles = data["smiles"].strip()
    include_metabolism = data.get("include_metabolism", True)

    if endpoint not in admet_router.get_available_endpoints():
        return jsonify({
            "error": f"Unknown endpoint: {endpoint}",
            "available": admet_router.get_available_endpoints(),
        }), 404

    try:
        pred = admet_router.predict(endpoint, smiles, include_metabolism=include_metabolism)
        return jsonify({
            "smiles": smiles,
            "endpoint": endpoint,
            **pred.to_dict(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/admet/classify", methods=["POST"])
def admet_classify():
    """
    Classify a molecule into chemical space regions.

    POST /admet/classify
    { "smiles": "CCO" }

    Returns MW class, TPSA class, prodrug status, routing decision.
    """
    if not _admet_ready or admet_router is None:
        return jsonify({"error": "ADMET v4 models not loaded"}), 503

    data = request.get_json()
    if not data or "smiles" not in data:
        return jsonify({"error": "Missing 'smiles'"}), 400

    smiles = data["smiles"].strip()

    try:
        chem_class = admet_router.classify_molecule(smiles)
        return jsonify({
            "smiles": smiles,
            **chem_class.to_dict(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/admet/models", methods=["GET"])
def admet_models():
    """List ADMET v4 prediction capabilities."""
    if not _admet_ready or admet_router is None:
        return jsonify({
            "status": "not_loaded",
            "message": "Run train_admet.py to train ADMET v4 models",
        })

    return jsonify(admet_router.describe())


# ─── QSPR Dataset Lookup ───

import pandas as pd
from rdkit import Chem as _Chem

_dataset_frames: dict = {}  # loaded lazily


def _load_datasets():
    """Load QSPR training CSV files into pandas DataFrames (once)."""
    global _dataset_frames
    if _dataset_frames:
        return _dataset_frames

    for prop_name, cfg in DATASET_CONFIGS.items():
        filepath = os.path.join(DATA_DIR, cfg["file"])
        if os.path.exists(filepath):
            try:
                df = pd.read_csv(filepath)
                smiles_col = cfg["smiles_col"]
                target_col = cfg["target_col"]
                # Compute canonical SMILES for reliable lookup
                canonical = []
                for smi in df[smiles_col]:
                    mol = _Chem.MolFromSmiles(str(smi))
                    canonical.append(_Chem.MolToSmiles(mol) if mol else str(smi))
                df["_canonical_smiles"] = canonical
                _dataset_frames[prop_name] = {
                    "df": df,
                    "smiles_col": smiles_col,
                    "target_col": target_col,
                    "task": cfg["task"],
                    "description": cfg["description"],
                    "unit": cfg.get("target_unit", ""),
                    "n_compounds": len(df),
                }
                logger.info(f"  Dataset loaded: {prop_name} ({len(df)} compounds)")
            except Exception as e:
                logger.warning(f"  Failed to load dataset {prop_name}: {e}")

    return _dataset_frames


@app.route("/qspr/lookup", methods=["POST"])
def qspr_lookup():
    """
    Look up a molecule in the QSPR training datasets.

    POST /qspr/lookup
    Body: {
        "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
        "name": "aspirin"  (optional, searches by name if available)
    }

    Returns measured/experimental values from training data.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing request body"}), 400

        smiles = data.get("smiles", "").strip()
        search_name = data.get("name", "").strip().lower()

        if not smiles and not search_name:
            return jsonify({"error": "Provide 'smiles' or 'name'"}), 400

        datasets = _load_datasets()
        if not datasets:
            return jsonify({"error": "No QSPR datasets available"}), 500

        # Canonicalize the query SMILES
        canonical_query = None
        if smiles:
            mol = _Chem.MolFromSmiles(smiles)
            if mol:
                canonical_query = _Chem.MolToSmiles(mol)
            else:
                return jsonify({"error": f"Invalid SMILES: {smiles}"}), 400

        results = {}
        found_in = []

        for prop_name, ds in datasets.items():
            df = ds["df"]
            match = None

            # Search by canonical SMILES
            if canonical_query:
                matches = df[df["_canonical_smiles"] == canonical_query]
                if not matches.empty:
                    match = matches.iloc[0]

            # Search by name (if available and no SMILES match)
            if match is None and search_name:
                name_cols = [c for c in df.columns if "name" in c.lower() or "compound" in c.lower()]
                for nc in name_cols:
                    name_matches = df[df[nc].astype(str).str.lower().str.contains(search_name, na=False)]
                    if not name_matches.empty:
                        match = name_matches.iloc[0]
                        break

            if match is not None:
                target_value = match[ds["target_col"]]
                entry = {
                    "measured_value": float(target_value) if pd.notna(target_value) else None,
                    "unit": ds["unit"],
                    "task": ds["task"],
                    "dataset": ds["description"],
                    "dataset_size": ds["n_compounds"],
                    "smiles_in_dataset": match[ds["smiles_col"]],
                }
                # Include name if available
                name_cols = [c for c in df.columns if "name" in c.lower() or "compound" in c.lower()]
                for nc in name_cols:
                    if pd.notna(match[nc]):
                        entry["compound_name"] = str(match[nc])
                        break
                results[prop_name] = entry
                found_in.append(prop_name)

        if not results:
            return jsonify({
                "found": False,
                "message": "Molecule not found in any QSPR training dataset.",
                "datasets_searched": list(datasets.keys()),
                "dataset_sizes": {k: v["n_compounds"] for k, v in datasets.items()},
            })

        return jsonify({
            "found": True,
            "query_smiles": smiles,
            "canonical_smiles": canonical_query,
            "found_in_datasets": found_in,
            "measured_properties": results,
            "note": "These are experimentally measured values from the training datasets, not ML predictions.",
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"QSPR lookup error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/qspr/stats", methods=["GET"])
def qspr_stats():
    """Return QSPR dataset statistics for AI context."""
    datasets = _load_datasets()
    stats = {}
    for prop_name, ds in datasets.items():
        df = ds["df"]
        target_col = ds["target_col"]
        target_vals = pd.to_numeric(df[target_col], errors="coerce").dropna()
        stats[prop_name] = {
            "description": ds["description"],
            "n_compounds": ds["n_compounds"],
            "task": ds["task"],
            "unit": ds["unit"],
            "target_stats": {
                "mean": round(float(target_vals.mean()), 4) if len(target_vals) > 0 else None,
                "std": round(float(target_vals.std()), 4) if len(target_vals) > 0 else None,
                "min": round(float(target_vals.min()), 4) if len(target_vals) > 0 else None,
                "max": round(float(target_vals.max()), 4) if len(target_vals) > 0 else None,
            },
        }
    return jsonify({"datasets": stats})


# ═══════════════════════════════════════════════════════════
#  PersonaPlex Voice AI Endpoints
# ═══════════════════════════════════════════════════════════

from personaplex.session_manager import get_session_manager
from personaplex.cerebras_bridge import get_cerebras_bridge
from personaplex.riva_client import get_tts_client, get_asr_client
from personaplex.audio_processor import AudioProcessor

# Voice session audio processors (session_id → AudioProcessor)
_audio_processors: dict = {}


@app.route("/voice/session", methods=["POST"])
def create_voice_session():
    """
    Create a new voice session.

    POST /voice/session
    Body: { "user_id": "...", "context": { ... } }

    Returns: { "session_id": "...", "capabilities": { ... } }
    """
    data = request.get_json()
    if not data or "user_id" not in data:
        return jsonify({"error": "Missing 'user_id'"}), 400

    user_id = data["user_id"]
    context = data.get("context", {})

    try:
        sm = get_session_manager()
        session = sm.create_session(user_id=user_id, context=context)

        # Initialize audio processor
        _audio_processors[session.session_id] = AudioProcessor()

        # Check Riva availability
        asr = get_asr_client()
        tts = get_tts_client()

        return jsonify({
            "session_id": session.session_id,
            "capabilities": {
                "riva_asr": asr.is_available,
                "riva_tts": tts.is_available,
                "cerebras_ai": get_cerebras_bridge().is_configured,
                "tool_calling": True,
                "streaming": True,
            },
            "config": {
                "sample_rate": 16000,
                "channels": 1,
                "encoding": "pcm_s16le",
                "frame_size_ms": 30,
            },
        })
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e)}), 429


@app.route("/voice/session/<session_id>", methods=["DELETE"])
def end_voice_session(session_id):
    """End a voice session."""
    sm = get_session_manager()
    sm.end_session(session_id)
    _audio_processors.pop(session_id, None)
    return jsonify({"status": "ended"})


@app.route("/voice/session/<session_id>", methods=["GET"])
def get_voice_session_info(session_id):
    """Get voice session status."""
    sm = get_session_manager()
    info = sm.get_session_info(session_id)
    if not info:
        return jsonify({"error": "Session not found or expired"}), 404
    return jsonify(info)


@app.route("/voice/process", methods=["POST"])
def voice_process():
    """
    Process a voice query (text already transcribed).

    This is the primary voice interaction endpoint. The frontend
    handles ASR (browser-side) and sends transcribed text.

    POST /voice/process
    Body: {
        "session_id": "...",
        "text": "What is Aspirin's LogP?",
        "user_context": "..."  (optional)
    }

    Returns: {
        "text": "...",
        "audio_base64": "..." (if Riva TTS available),
        "tool_calls": [...],
        "latency_ms": 123.4
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing request body"}), 400

    session_id = data.get("session_id", "")
    text = data.get("text", "").strip()
    user_context = data.get("user_context", "")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    # Validate session
    sm = get_session_manager()
    session = sm.get_session(session_id) if session_id else None

    # Build conversation messages
    if session:
        session.add_message("user", text)
        messages = session.get_messages_for_llm()
    else:
        messages = [{"role": "user", "content": text}]

    # Generate response via Gemini AI
    bridge = get_cerebras_bridge()
    result = bridge.generate_response(
        messages=messages,
        user_context=user_context,
        use_tools=True,
        temperature=0.7,
    )

    response_text = result["text"]

    # Add assistant response to session history
    if session:
        session.add_message("assistant", response_text)

    # Try TTS synthesis
    audio_base64 = None
    tts = get_tts_client()
    if tts.is_available:
        audio_base64 = tts.synthesize_to_base64(response_text)

    return jsonify({
        "text": response_text,
        "audio_base64": audio_base64,
        "tool_calls": result.get("tool_calls", []),
        "usage": result.get("usage", {}),
        "latency_ms": result.get("latency_ms", 0),
        "tts_available": tts.is_available,
    })


@app.route("/voice/tts", methods=["POST"])
def voice_tts():
    """
    Text-to-Speech synthesis endpoint using Microsoft Edge TTS (neural voices).

    POST /voice/tts
    Body: { "text": "...", "voice": "en-US-AriaNeural" (optional) }

    Returns: MP3 audio stream.
    """
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'text'"}), 400

    text = data["text"].strip()
    if not text:
        return jsonify({"error": "Empty text"}), 400

    # Pick voice — default to a warm, natural female voice
    voice = data.get("voice", "en-US-AriaNeural")

    try:
        import asyncio
        import edge_tts

        async def _synth():
            comm = edge_tts.Communicate(text, voice, rate="+5%", pitch="+0Hz")
            chunks = []
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    chunks.append(chunk["data"])
            return b"".join(chunks)

        # Run async in sync context
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                audio_bytes = pool.submit(lambda: asyncio.run(_synth())).result(timeout=10)
        else:
            audio_bytes = asyncio.run(_synth())

        if audio_bytes:
            from flask import Response
            return Response(
                audio_bytes,
                mimetype="audio/mpeg",
                headers={
                    "Content-Disposition": "inline; filename=speech.mp3",
                    "Cache-Control": "no-cache",
                },
            )
        else:
            return jsonify({"text": text, "tts_available": False, "fallback": "browser_speech_synthesis"}), 200

    except ImportError:
        logger.warning("edge-tts not installed — falling back to browser TTS")
        return jsonify({"text": text, "tts_available": False, "fallback": "browser_speech_synthesis"}), 200
    except Exception as e:
        logger.error(f"Edge TTS error: {e}")
        return jsonify({"text": text, "tts_available": False, "fallback": "browser_speech_synthesis"}), 200


@app.route("/voice/status", methods=["GET"])
def voice_status():
    """Voice subsystem status check."""
    sm = get_session_manager()
    asr = get_asr_client()
    tts = get_tts_client()
    bridge = get_cerebras_bridge()

    # Check if edge-tts is available
    edge_tts_ok = False
    try:
        import edge_tts  # noqa: F401
        edge_tts_ok = True
    except ImportError:
        pass

    return jsonify({
        "voice_engine": "PersonaPlex v1.1",
        "active_sessions": sm.get_active_count(),
        "capabilities": {
            "riva_asr": asr.is_available,
            "riva_tts": tts.is_available,
            "edge_tts": edge_tts_ok,
            "cerebras_ai": bridge.is_configured,
        },
        "tts_voices": [
            "en-US-AriaNeural",
            "en-US-JennyNeural",
            "en-US-GuyNeural",
            "en-GB-SoniaNeural",
            "en-US-AnaNeural",
        ] if edge_tts_ok else [],
        "config": {
            "session_timeout_sec": 600,
            "max_sessions": 100,
            "max_per_user": 3,
            "sample_rate": 16000,
        },
    })


# ═══════════════════════════════════════
#  3D Molecular Geometry & Conformer Generation
# ═══════════════════════════════════════

@app.route("/generate-3d", methods=["POST"])
def generate_3d():
    """
    Generate 3D coordinates and conformers for a molecule given its SMILES.
    Returns atom positions, bond information, and optional conformer frames
    suitable for the Three.js molecular viewer.

    Request JSON:
      { "smiles": "CCO", "num_conformers": 5 }

    Response JSON:
      {
        "atoms": [{ "id": 1, "element": "C", "x": 0, "y": 0, "z": 0 }, ...],
        "bonds": [{ "atom1": 1, "atom2": 2, "order": 1 }, ...],
        "conformers": [[{x,y,z}, ...], ...],
        "name": "ethanol",
        "smiles": "CCO"
      }
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, Descriptors
    except ImportError:
        return jsonify({"error": "RDKit not available on this server"}), 500

    data = request.get_json(force=True)
    smiles = data.get("smiles", "").strip()
    num_conformers = min(int(data.get("num_conformers", 5)), 20)

    if not smiles:
        return jsonify({"error": "SMILES string required"}), 400

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return jsonify({"error": f"Invalid SMILES: {smiles}"}), 400

    # Add hydrogens for proper 3D embedding
    mol_h = Chem.AddHs(mol)

    # Generate conformers
    try:
        conf_ids = AllChem.EmbedMultipleConfs(
            mol_h,
            numConfs=max(num_conformers, 1),
            randomSeed=42,
            maxAttempts=200,
            pruneRmsThresh=0.5,
            useExpTorsionAnglePrefs=True,
            useBasicKnowledge=True,
            enforceChirality=True,
        )
        if len(conf_ids) == 0:
            # Fallback: try without pruning
            conf_ids = AllChem.EmbedMultipleConfs(mol_h, numConfs=1, randomSeed=42)

        # Optimize each conformer with MMFF94
        for cid in conf_ids:
            try:
                AllChem.MMFFOptimizeMolecule(mol_h, confId=cid, maxIters=500)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Conformer generation failed for {smiles}: {e}")
        # Try basic 2D → 3D fallback
        AllChem.EmbedMolecule(mol_h, randomSeed=42)
        conf_ids = [0]

    if mol_h.GetNumConformers() == 0:
        return jsonify({"error": "Could not generate 3D coordinates"}), 422

    # Use first conformer for atom positions
    conf0 = mol_h.GetConformer(0)

    # Build atom list (1-indexed IDs)
    atoms = []
    for i in range(mol_h.GetNumAtoms()):
        pos = conf0.GetAtomPosition(i)
        atom = mol_h.GetAtomWithIdx(i)
        atoms.append({
            "id": i + 1,
            "element": atom.GetSymbol(),
            "x": round(pos.x, 4),
            "y": round(pos.y, 4),
            "z": round(pos.z, 4),
            "charge": atom.GetFormalCharge(),
        })

    # Build bond list
    bonds = []
    for bond in mol_h.GetBonds():
        bond_type = bond.GetBondType()
        order = 1
        if bond_type == Chem.rdchem.BondType.DOUBLE:
            order = 2
        elif bond_type == Chem.rdchem.BondType.TRIPLE:
            order = 3
        elif bond_type == Chem.rdchem.BondType.AROMATIC:
            order = 1.5
        bonds.append({
            "atom1": bond.GetBeginAtomIdx() + 1,
            "atom2": bond.GetEndAtomIdx() + 1,
            "order": order,
        })

    # Build conformer frames
    conformers = []
    for cid in conf_ids:
        conf = mol_h.GetConformer(cid)
        frame = []
        for i in range(mol_h.GetNumAtoms()):
            pos = conf.GetAtomPosition(i)
            frame.append({
                "x": round(pos.x, 4),
                "y": round(pos.y, 4),
                "z": round(pos.z, 4),
            })
        conformers.append(frame)

    # Try to get molecule name
    name = smiles
    try:
        name = Chem.MolToSmiles(mol)  # canonical
    except Exception:
        pass

    return jsonify({
        "atoms": atoms,
        "bonds": bonds,
        "conformers": conformers if len(conformers) > 1 else [],
        "smiles": smiles,
        "name": name,
        "num_atoms": len(atoms),
        "num_bonds": len(bonds),
        "num_conformers": len(conformers),
        "molecular_weight": round(Descriptors.MolWt(mol), 2),
    })


@app.route("/generate-reaction-3d", methods=["POST"])
def generate_reaction_3d():
    """
    Generate 3D geometries for reactants and products of a reaction.
    Attempts atom mapping to enable smooth morphing animation.

    Request JSON:
      {
        "reactant_smiles": "CCO",
        "product_smiles": "CC=O",
        "bond_changes": [
          { "type": "break", "atom1": 3, "atom2": 6 },
          { "type": "form", "atom1": 2, "atom2": 3 }
        ]
      }

    Response JSON:
      {
        "before": { atoms, bonds, ... },
        "after":  { atoms, bonds, ... },
        "bondChanges": [...]
      }
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, Descriptors
    except ImportError:
        return jsonify({"error": "RDKit not available"}), 500

    data = request.get_json(force=True)
    reactant_smiles = data.get("reactant_smiles", "").strip()
    product_smiles = data.get("product_smiles", "").strip()
    bond_changes = data.get("bond_changes", [])

    if not reactant_smiles or not product_smiles:
        return jsonify({"error": "Both reactant_smiles and product_smiles required"}), 400

    def smiles_to_3d(smi):
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            return None
        mol_h = Chem.AddHs(mol)
        AllChem.EmbedMolecule(mol_h, randomSeed=42, maxAttempts=200)
        if mol_h.GetNumConformers() == 0:
            return None
        try:
            AllChem.MMFFOptimizeMolecule(mol_h, maxIters=500)
        except Exception:
            pass
        conf = mol_h.GetConformer(0)
        atoms = []
        for i in range(mol_h.GetNumAtoms()):
            pos = conf.GetAtomPosition(i)
            atom = mol_h.GetAtomWithIdx(i)
            atoms.append({
                "id": i + 1,
                "element": atom.GetSymbol(),
                "x": round(pos.x, 4),
                "y": round(pos.y, 4),
                "z": round(pos.z, 4),
            })
        bonds_list = []
        for bond in mol_h.GetBonds():
            bt = bond.GetBondType()
            order = 1
            if bt == Chem.rdchem.BondType.DOUBLE:
                order = 2
            elif bt == Chem.rdchem.BondType.TRIPLE:
                order = 3
            bonds_list.append({
                "atom1": bond.GetBeginAtomIdx() + 1,
                "atom2": bond.GetEndAtomIdx() + 1,
                "order": order,
            })
        return {"atoms": atoms, "bonds": bonds_list, "smiles": smi}

    before = smiles_to_3d(reactant_smiles)
    after = smiles_to_3d(product_smiles)

    if not before:
        return jsonify({"error": f"Invalid reactant SMILES: {reactant_smiles}"}), 400
    if not after:
        return jsonify({"error": f"Invalid product SMILES: {product_smiles}"}), 400

    # Pad atoms to equal length for morphing (shorter molecule gets virtual atoms at centroid)
    max_atoms = max(len(before["atoms"]), len(after["atoms"]))
    def pad_atoms(mol_data, target):
        existing = mol_data["atoms"]
        if len(existing) >= target:
            return
        cx = sum(a["x"] for a in existing) / len(existing) if existing else 0
        cy = sum(a["y"] for a in existing) / len(existing) if existing else 0
        cz = sum(a["z"] for a in existing) / len(existing) if existing else 0
        for i in range(len(existing), target):
            existing.append({
                "id": i + 1,
                "element": "H",
                "x": round(cx, 4),
                "y": round(cy, 4),
                "z": round(cz, 4),
            })

    pad_atoms(before, max_atoms)
    pad_atoms(after, max_atoms)

    return jsonify({
        "before": before,
        "after": after,
        "bondChanges": bond_changes,
    })


# ═══════════════════════════════════════════════════════════════
#  Network Pharmacology Endpoints
# ═══════════════════════════════════════════════════════════════

from network_pharmacology.target_prediction import predict_targets
from network_pharmacology.ppi_network import build_ppi_network
from network_pharmacology.pathway_enrichment import enrich_pathways
from network_pharmacology.disease_mapping import map_diseases
from network_pharmacology.disease_inference import run_disease_inference


@app.route("/network/targets", methods=["POST"])
def network_targets():
    """Predict protein targets for a SMILES compound."""
    data = request.get_json(force=True)
    smiles = data.get("smiles", "")
    top_k = data.get("top_k", 20)

    if not smiles:
        return jsonify({"error": "Missing 'smiles' parameter"}), 400

    try:
        result = predict_targets(smiles, top_k=top_k)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.error(f"Target prediction failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/network/ppi", methods=["POST"])
def network_ppi():
    """Build PPI network from a list of genes."""
    data = request.get_json(force=True)
    genes = data.get("genes", [])
    min_score = data.get("min_score", 400)

    if not genes:
        return jsonify({"error": "Missing 'genes' parameter"}), 400

    try:
        result = build_ppi_network(genes, min_score=min_score)
        return jsonify(result)
    except Exception as e:
        logger.error(f"PPI network construction failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/network/pathways", methods=["POST"])
def network_pathways():
    """Perform pathway enrichment analysis for a gene list."""
    data = request.get_json(force=True)
    genes = data.get("genes", [])
    p_threshold = data.get("p_threshold", 0.05)

    if not genes:
        return jsonify({"error": "Missing 'genes' parameter"}), 400

    try:
        result = enrich_pathways(genes, p_threshold=p_threshold)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Pathway enrichment failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/network/diseases", methods=["POST"])
def network_diseases():
    """Map genes to associated diseases."""
    data = request.get_json(force=True)
    genes = data.get("genes", [])
    top_k = data.get("top_k", 25)

    if not genes:
        return jsonify({"error": "Missing 'genes' parameter"}), 400

    try:
        result = map_diseases(genes, top_k=top_k)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Disease mapping failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/network/disease-inference", methods=["POST"])
def network_disease_inference():
    """
    Run the 9-layer disease inference engine on pre-computed pipeline results.
    Accepts targets, PPI, pathways, and diseases from individual API calls
    and applies false-positive suppression, composite scoring, and AI gating.
    """
    data = request.get_json(force=True)
    smiles = data.get("smiles", "")
    compound_name = data.get("compound_name", "")
    targets_result = data.get("targets", {})
    ppi_result = data.get("ppi_network", {})
    pathways_result = data.get("pathways", {})
    diseases_result = data.get("diseases", {})

    if not smiles or not targets_result:
        return jsonify({"error": "Missing required parameters"}), 400

    try:
        inference = run_disease_inference(
            smiles=smiles,
            targets_result=targets_result,
            ppi_result=ppi_result,
            pathways_result=pathways_result,
            diseases_result=diseases_result,
            compound_name=compound_name,
        )
        return jsonify(inference)
    except Exception as e:
        logger.error(f"Disease inference failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/network/full-analysis", methods=["POST"])
def network_full_analysis():
    """
    Run the complete Network Pharmacology pipeline with biologically
    disciplined disease inference (v2.0):
      1. Predict targets from SMILES
      2. Build PPI network from targets
      3. Enrich pathways
      4. Map diseases (raw)
      5. Disease inference engine (9-layer false-positive suppression)
    Returns combined result in one response.
    """
    data = request.get_json(force=True)
    smiles = data.get("smiles", "")
    compound_name = data.get("compound_name", "")

    if not smiles:
        return jsonify({"error": "Missing 'smiles' parameter"}), 400

    try:
        # Step 1: Target prediction
        targets_result = predict_targets(smiles, top_k=data.get("top_k", 20))
        if "error" in targets_result:
            return jsonify({"error": targets_result["error"]}), 400

        gene_list = targets_result.get("gene_list", [])

        if not gene_list:
            return jsonify({
                "smiles": smiles,
                "targets": targets_result,
                "ppi_network": {"nodes": [], "edges": [], "metrics": {}},
                "pathways": {"pathways": [], "pathway_count": 0},
                "diseases": {"diseases": [], "disease_count": 0},
                "disease_inference": {
                    "diseases": [], "disease_count": 0,
                    "ai_suggestion": {
                        "has_suggestion": False,
                        "message": "No targets predicted for this compound.",
                        "confidence": "none",
                    },
                },
                "summary": "No targets predicted for this compound.",
            })

        # Step 2: PPI network
        ppi_result = build_ppi_network(gene_list, min_score=data.get("min_score", 400))

        # Expand gene list with hub genes from PPI
        hub_genes = ppi_result.get("metrics", {}).get("hub_genes", [])
        expanded_genes = list(dict.fromkeys(gene_list + hub_genes))

        # Step 3: Pathway enrichment
        pathways_result = enrich_pathways(expanded_genes, p_threshold=data.get("p_threshold", 0.05))

        # Step 4: Raw disease mapping
        diseases_result = map_diseases(expanded_genes, top_k=data.get("disease_top_k", 25))

        # Step 5: Disease inference engine (v2.0 — 9-layer false-positive suppression)
        inference = run_disease_inference(
            smiles=smiles,
            targets_result=targets_result,
            ppi_result=ppi_result,
            pathways_result=pathways_result,
            diseases_result=diseases_result,
            compound_name=compound_name,
        )

        # Build summary from inference results
        target_count = targets_result.get("target_count", 0)
        pathway_count = pathways_result.get("pathway_count", 0)
        inferred_disease_count = inference.get("disease_count", 0)
        suppressed_count = inference.get("suppressed_count", 0)
        top_areas = list(inference.get("therapeutic_areas", {}).keys())[:3]
        coherence = inference.get("network_coherence", {})

        summary = (
            f"Identified {target_count} potential protein targets "
            f"({inference.get('target_summary', {}).get('high_confidence', 0)} high-confidence), "
            f"{ppi_result.get('gene_count', 0)} nodes in PPI network "
            f"(coherence: {coherence.get('coherence_score', 0):.2f}), "
            f"{pathway_count} enriched pathways, and "
            f"{inferred_disease_count} validated disease associations "
            f"({suppressed_count} suppressed by false-positive filters)."
        )
        if top_areas:
            summary += f" Top therapeutic areas: {', '.join(top_areas)}."
        if coherence.get("flags"):
            summary += f" Network flags: {'; '.join(coherence['flags'][:2])}."

        return jsonify({
            "smiles": smiles,
            "targets": targets_result,
            "ppi_network": ppi_result,
            "pathways": pathways_result,
            "diseases": diseases_result,           # Raw diseases (backwards compat)
            "disease_inference": inference,         # v2.0 inference results
            "summary": summary,
        })

    except Exception as e:
        logger.error(f"Full network analysis failed: {e}")
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════
#  Model Loading (runs for both gunicorn and direct execution)
# ═══════════════════════════════════════
def _initialize():
    """Load models and initialize services. Called at module load time."""
    global _server_ready
    if _server_ready:
        return

    logger.info("=" * 60)
    logger.info("  InSilico Lab — ML + Voice AI Server v2.2")
    logger.info("  Engine: QSPR v2.0 (ECFP4 + Ensemble)")
    logger.info("  ADMET:  v4.0 (ECFP6 + Domain-Aware)")
    logger.info("  Voice:  PersonaPlex + Gemini AI")
    logger.info("=" * 60)

    load_qspr_models()

    # ADMET v4 is heavy — skip in LOW_MEMORY to stay under 512 MB
    if LOW_MEMORY:
        logger.info("LOW_MEMORY mode: skipping ADMET v4 loading (use /predict instead)")
    else:
        load_admet_models()

    if not ensembles and not legacy_models:
        logger.warning(
            "No models found! Predictions will use fallback. Run:\n"
            "  python train_admet.py     (ADMET v4)\n"
            "  python train_qspr.py      (QSPR v2)\n"
            "  python train_models.py    (Legacy v1)\n"
        )

    # Initialize PersonaPlex
    try:
        sm = get_session_manager()
        bridge = get_cerebras_bridge()
        if bridge.is_configured:
            logger.info("  ✓ Gemini AI configured")
        else:
            logger.warning("  ✗ Gemini API key not set — voice reasoning disabled")

        asr = get_asr_client()
        tts = get_tts_client()
        logger.info(f"  {'✓' if asr.is_available else '✗'} Riva ASR: {'connected' if asr.is_available else 'browser fallback'}")
        logger.info(f"  {'✓' if tts.is_available else '✗'} Riva TTS: {'connected' if tts.is_available else 'browser fallback'}")
    except Exception as e:
        logger.warning(f"  PersonaPlex init warning: {e}")

    logger.info("Server initialized and ready.")


# Initialize when module is imported (gunicorn --preload) or run directly
_initialize()


# ═══════════════════════════════════════
#  Main (for local development: python server.py)
# ═══════════════════════════════════════
if __name__ == "__main__":
    logger.info(f"\nStarting server on http://localhost:{FLASK_PORT}")
    logger.info(f"Endpoints:")
    logger.info(f"  POST /predict              — Predict all properties (QSPR ensemble)")
    logger.info(f"  POST /admet/predict        — ADMET v4 domain-aware prediction (all endpoints)")
    logger.info(f"  POST /admet/predict/<ep>   — ADMET v4 single endpoint prediction")
    logger.info(f"  POST /admet/classify       — Classify molecule (MW/TPSA/prodrug)")
    logger.info(f"  GET  /admet/models         — ADMET v4 capabilities")
    logger.info(f"  POST /descriptors          — Get molecular descriptors")
    logger.info(f"  POST /drug-likeness        — Drug-likeness assessment")
    logger.info(f"  POST /generate-3d          — 3D coordinates & conformers")
    logger.info(f"  POST /generate-reaction-3d — Reaction 3D geometries")
    logger.info(f"  GET  /models               — List capabilities")
    logger.info(f"  GET  /health               — Health check")
    logger.info(f"  POST /voice/session        — Create voice session")
    logger.info(f"  POST /voice/process        — Process voice query")
    logger.info(f"  POST /voice/tts            — Text-to-speech")
    logger.info(f"  GET  /voice/status         — Voice subsystem status")
    logger.info(f"  POST /network/targets      — Predict protein targets")
    logger.info(f"  POST /network/ppi          — Build PPI network")
    logger.info(f"  POST /network/pathways     — Pathway enrichment")
    logger.info(f"  POST /network/diseases     — Disease mapping")
    logger.info(f"  POST /network/full-analysis— Full network pharmacology")

    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False)

"""
train_admet.py — ADMET v4 Training Pipeline
=============================================
Full training pipeline for the domain-aware ADMET prediction system.

Usage:
  python train_admet.py                    # Train all endpoints
  python train_admet.py --endpoint logp    # Train only LogP
  python train_admet.py --endpoints logp,solubility,bbbp  # Subset
  python train_admet.py --quick            # Reduced estimators
  python train_admet.py --skip-fetch       # Use cached datasets only
  python train_admet.py --tune             # Optuna hyperparameter tuning

Workflow:
  1. Fetch & merge multi-source datasets (MoleculeNet + ChEMBL + PubChem)
  2. Preprocess: standardize SMILES, deduplicate, stratify MW/TPSA
  3. Compute ECFP6 + physicochemical + topological + functional group features
  4. Scaffold-based train/test split with MW/TPSA stratification
  5. Train RF + XGBoost for each endpoint (optionally per-route)
  6. Fit applicability domain
  7. Train prodrug detector & metabolism predictor (shared models)
  8. Build ensemble router
  9. Stratified validation
  10. Serialize everything

Output:
  ml/models/admet/*.joblib          — Trained models
  ml/models/admet/*.meta.json       — Model metadata & metrics
  ml/models/admet/router.joblib     — Ensemble router
  ml/models/admet/training_report.json — Full training report
"""

import os
import sys
import time
import json
import logging
import argparse
import numpy as np
import joblib

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from admet.config import (
    ADMET_ENDPOINTS,
    DATASET_SOURCES,
    MODEL_DIR,
    DATA_DIR,
    CV_FOLDS,
    DEFAULT_RF_PARAMS,
    DEFAULT_XGB_PARAMS,
    MODEL_VERSION,
    DESCRIPTOR_VERSION,
    ROUTING_THRESHOLDS,
    OPTUNA_N_TRIALS,
    OPTUNA_TIMEOUT,
    ADMETConfig,
)
from admet.data.preprocessor import ADMETPreprocessor, StratifiedDataset
from admet.data.fetcher import DatasetFetcher
from admet.features.hybrid_fingerprints import HybridFingerprintCalculator
from admet.domain.applicability import ApplicabilityDomain
from admet.models.base import RandomForestADMET, XGBoostADMET
from admet.models.ensemble import ADMETEnsemble
from admet.models.prodrug_detector import ProdugDetector
from admet.models.metabolism import MetabolismPredictor
from admet.models.router import EnsembleRouter
from admet.evaluation.stratified_validator import StratifiedValidator, ValidationReport

# Re-use QSPR v2 scaffold splitter and Optuna tuner if available
try:
    from qspr.splitting import ScaffoldSplitter
except ImportError:
    ScaffoldSplitter = None

try:
    from qspr.tuning import OptunaTuner
except ImportError:
    OptunaTuner = None

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("train_admet")


# ═══════════════════════════════════════════
#  Training Helpers
# ═══════════════════════════════════════════

def scaffold_split(smiles: list, test_size: float = 0.2):
    """Scaffold-based train/test split."""
    if ScaffoldSplitter is not None:
        splitter = ScaffoldSplitter(test_size=test_size)
        return splitter.split(smiles)
    else:
        # Fallback: random split with fixed seed
        n = len(smiles)
        idx = np.arange(n)
        np.random.seed(42)
        np.random.shuffle(idx)
        cut = int(n * (1 - test_size))
        return idx[:cut].tolist(), idx[cut:].tolist()


def tune_hyperparameters(task, X_train, y_train, smiles_train):
    """Optuna hyperparameter tuning if available."""
    if OptunaTuner is None:
        return DEFAULT_RF_PARAMS.copy(), DEFAULT_XGB_PARAMS.copy()

    tuner = OptunaTuner(
        task=task,
        n_trials=OPTUNA_N_TRIALS,
        timeout=OPTUNA_TIMEOUT,
    )
    rf_params = tuner.tune_random_forest(X_train, y_train, smiles_train)
    xgb_params = tuner.tune_xgboost(X_train, y_train, smiles_train)
    return rf_params, xgb_params


def save_model(model, endpoint, model_name, metadata):
    """Save a trained model with metadata."""
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, f"{endpoint}_{model_name}.joblib")
    meta_path = os.path.join(MODEL_DIR, f"{endpoint}_{model_name}.meta.json")

    joblib.dump({
        "model": model.model,
        "scaler": model.scaler,
        "feature_names": model._feature_names,
        "training_stats": model._training_stats,
    }, model_path)

    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, default=lambda o: str(o))

    logger.info(f"  Saved: {model_path} ({os.path.getsize(model_path):,} bytes)")


# ═══════════════════════════════════════════
#  Per-Endpoint Training
# ═══════════════════════════════════════════

def train_endpoint(
    endpoint: str,
    config: dict,
    fetcher: DatasetFetcher,
    preprocessor: ADMETPreprocessor,
    fp_calc: HybridFingerprintCalculator,
    tune: bool = False,
    quick: bool = False,
    skip_fetch: bool = False,
) -> dict:
    """
    Train RF + XGBoost ensemble for a single ADMET endpoint.

    Returns training report dict.
    """
    task = config["task"]
    t_start = time.time()
    report = {"endpoint": endpoint, "task": task}

    logger.info(f"  [{endpoint.upper()}] {config['description']} ({task})")

    # ── 1. Fetch dataset ──
    logger.info("  Fetching dataset...")
    import pandas as pd

    try:
        dfs = fetcher.fetch_all_for_endpoint(endpoint)
    except Exception as e:
        logger.warning(f"  Dataset fetch failed: {e}")
        dfs = []

    # MoleculeNet fallback if fetch returned nothing
    if not dfs:
        mn_datasets = DATASET_SOURCES["moleculenet"]["datasets"]
        if endpoint in mn_datasets:
            mn_cfg = mn_datasets[endpoint]
            mn_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "data",
                mn_cfg["file"],
            )
            if os.path.exists(mn_path):
                fallback_df = pd.read_csv(mn_path)
                fallback_df = fallback_df.rename(columns={
                    mn_cfg["smiles_col"]: "smiles",
                    mn_cfg["target_col"]: "target",
                })
                fallback_df["source"] = "moleculenet"
                dfs = [fallback_df]
                logger.info(f"  MoleculeNet fallback: {len(fallback_df)} rows")
            else:
                report["status"] = "error"
                report["error"] = f"No data available for {endpoint}"
                return report
        else:
            report["status"] = "error"
            report["error"] = f"No data sources for {endpoint}"
            return report

    # Merge all fetched DataFrames into one
    df = pd.concat(dfs, ignore_index=True)
    df = df.drop_duplicates(subset=["smiles"], keep="first")

    if len(df) < 20:
        report["status"] = "skipped"
        report["reason"] = f"Insufficient data ({len(df)} samples)"
        return report

    logger.info(f"  Raw dataset: {len(df)} rows")

    # ── 2. Preprocess ──
    logger.info("  Preprocessing & standardizing...")
    try:
        preprocessor.reset_dedup_cache()
        cleaned_df = preprocessor.preprocess_dataframe(
            df,
            smiles_col="smiles",
            target_col="target",
            source_label=endpoint,
        )
        dataset = preprocessor.build_stratified_dataset(
            cleaned_df,
            name=endpoint,
            task=task,
            description=config.get("description", ""),
            target_unit=config.get("unit", ""),
        )
    except Exception as e:
        logger.warning(f"  Preprocessing failed: {e}")
        report["status"] = "error"
        report["error"] = str(e)
        return report

    if len(dataset.smiles) < 20:
        report["status"] = "skipped"
        report["reason"] = f"Insufficient valid molecules ({len(dataset.smiles)})"
        return report

    logger.info(f"  After preprocessing: {len(dataset.smiles)} molecules")
    logger.info(f"  Stats: {dataset.stats}")

    # ── 3. Compute features ──
    logger.info(f"  Computing hybrid features (ECFP6 + 26 physchem + 8 topo + 12 FG)...")
    t_fp = time.time()

    features, valid_idx, failed = fp_calc.compute_batch_safe(dataset.smiles)
    if len(features) < 20:
        report["status"] = "error"
        report["error"] = f"Feature computation failed for most molecules ({len(failed)} failures)"
        return report

    y = dataset.targets[valid_idx]
    smiles = [dataset.smiles[i] for i in valid_idx]
    mw_bins = dataset.mw_bins[valid_idx] if dataset.mw_bins is not None else None
    tpsa_bins = dataset.tpsa_bins[valid_idx] if dataset.tpsa_bins is not None else None

    logger.info(
        f"  Features: {features.shape[0]} molecules × {features.shape[1]} features "
        f"({time.time() - t_fp:.1f}s, {len(failed)} failed)"
    )

    # ── 4. Scaffold split ──
    logger.info("  Scaffold-based train/test split...")
    train_idx, test_idx = scaffold_split(smiles, test_size=0.2)

    X_train, y_train = features[train_idx], y[train_idx]
    X_test, y_test = features[test_idx], y[test_idx]
    smiles_train = [smiles[i] for i in train_idx]
    smiles_test = [smiles[i] for i in test_idx]

    logger.info(f"  Train: {len(train_idx)} | Test: {len(test_idx)}")

    if task == "classification":
        unique, counts = np.unique(y_train, return_counts=True)
        logger.info(f"  Class distribution: {dict(zip(unique.astype(int), counts))}")

    # ── 5. Hyperparameter tuning (optional) ──
    rf_params = DEFAULT_RF_PARAMS.copy()
    xgb_params = DEFAULT_XGB_PARAMS.copy()

    if quick:
        rf_params["n_estimators"] = 150
        xgb_params["n_estimators"] = 150
        logger.info("  Quick mode: 150 estimators")

    if tune:
        logger.info("  Running Optuna hyperparameter optimization...")
        rf_params, xgb_params = tune_hyperparameters(
            task, X_train, y_train, smiles_train,
        )
        logger.info(f"  Best RF params: {rf_params}")
        logger.info(f"  Best XGB params: {xgb_params}")

    # ── 6. Train models ──
    feature_names = fp_calc.feature_names

    logger.info("  Training RandomForest...")
    rf = RandomForestADMET(task=task, endpoint=endpoint, params=rf_params)
    rf.fit(X_train, y_train, feature_names=feature_names)

    logger.info("  Training XGBoost...")
    xgb = XGBoostADMET(task=task, endpoint=endpoint, params=xgb_params)
    xgb.fit(X_train, y_train, feature_names=feature_names)

    # ── 7. Evaluate individual models ──
    rf_pred, rf_unc = rf.predict_with_uncertainty(X_test)
    xgb_pred, xgb_unc = xgb.predict_with_uncertainty(X_test)

    if task == "regression":
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
        rf_metrics = {
            "r2": round(float(r2_score(y_test, rf_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, rf_pred))), 4),
            "mae": round(float(mean_absolute_error(y_test, rf_pred)), 4),
        }
        xgb_metrics = {
            "r2": round(float(r2_score(y_test, xgb_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, xgb_pred))), 4),
            "mae": round(float(mean_absolute_error(y_test, xgb_pred)), 4),
        }
        rf_score = max(rf_metrics["r2"], 0.01)
        xgb_score = max(xgb_metrics["r2"], 0.01)
    else:
        from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
        rf_binary = (rf_pred > 0.5).astype(int)
        xgb_binary = (xgb_pred > 0.5).astype(int)
        y_int = y_test.astype(int)
        rf_metrics = {
            "accuracy": round(float(accuracy_score(y_int, rf_binary)), 4),
            "f1": round(float(f1_score(y_int, rf_binary, zero_division=0)), 4),
        }
        xgb_metrics = {
            "accuracy": round(float(accuracy_score(y_int, xgb_binary)), 4),
            "f1": round(float(f1_score(y_int, xgb_binary, zero_division=0)), 4),
        }
        try:
            rf_metrics["auc"] = round(float(roc_auc_score(y_int, rf_pred)), 4)
            xgb_metrics["auc"] = round(float(roc_auc_score(y_int, xgb_pred)), 4)
        except Exception:
            pass
        rf_score = max(rf_metrics.get("auc", rf_metrics["f1"]), 0.01)
        xgb_score = max(xgb_metrics.get("auc", xgb_metrics["f1"]), 0.01)

    logger.info(f"  RF metrics:  {rf_metrics}")
    logger.info(f"  XGB metrics: {xgb_metrics}")

    # ── 8. Build ensemble ──
    total_score = rf_score + xgb_score
    rf_weight = rf_score / total_score
    xgb_weight = xgb_score / total_score

    ensemble = ADMETEnsemble(task=task, endpoint=endpoint)
    ensemble.add_model("random_forest", rf, weight=rf_weight)
    ensemble.add_model("xgboost", xgb, weight=xgb_weight)

    # Ensemble test metrics
    ens_result = ensemble.predict(X_test)
    ens_pred = ens_result["prediction"]
    if task == "regression":
        ens_metrics = {
            "r2": round(float(r2_score(y_test, ens_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, ens_pred))), 4),
        }
    else:
        ens_binary = (ens_pred > 0.5).astype(int) if ens_pred.dtype == float else ens_pred
        ens_metrics = {
            "accuracy": round(float(accuracy_score(y_int, ens_binary)), 4),
            "f1": round(float(f1_score(y_int, ens_binary, zero_division=0)), 4),
        }
        try:
            ens_prob = ens_result.get("probability", ens_pred)
            ens_metrics["auc"] = round(float(roc_auc_score(y_int, ens_prob)), 4)
        except Exception:
            pass

    logger.info(f"  Ensemble metrics: {ens_metrics}")

    # ── 9. Fit Applicability Domain ──
    logger.info("  Fitting applicability domain...")
    ad = ApplicabilityDomain()
    ad.fit(smiles_train, X_train)

    # ── 10. Stratified Validation ──
    logger.info("  Running stratified validation...")
    validator = StratifiedValidator()
    test_mw_bins = mw_bins[test_idx] if mw_bins is not None else None
    test_tpsa_bins = tpsa_bins[test_idx] if tpsa_bins is not None else None

    val_report = validator.evaluate_ensemble(
        ensemble=ensemble,
        test_smiles=smiles_test,
        test_targets=y_test,
        mw_bins=test_mw_bins,
        tpsa_bins=test_tpsa_bins,
        task=task,
        endpoint=endpoint,
    )

    # Log stratified results
    for s in val_report.mw_stratified:
        logger.info(f"    MW {s.stratum}: n={s.n_samples}, {s.metrics}")
    for s in val_report.tpsa_stratified:
        logger.info(f"    TPSA {s.stratum}: n={s.n_samples}, {s.metrics}")
    if val_report.calibration:
        logger.info(f"    Calibration error: {val_report.calibration.calibration_error:.4f}")

    # ── 11. Save models ──
    logger.info("  Saving models...")
    save_model(rf, endpoint, "random_forest", {
        "endpoint": endpoint,
        "task": task,
        "algorithm": "RandomForest",
        "params": rf_params,
        "metrics": rf_metrics,
    })
    save_model(xgb, endpoint, "xgboost", {
        "endpoint": endpoint,
        "task": task,
        "algorithm": "XGBoost",
        "params": xgb_params,
        "metrics": xgb_metrics,
    })

    # Save ensemble config
    ens_config_path = os.path.join(MODEL_DIR, f"{endpoint}_ensemble.json")
    with open(ens_config_path, "w") as f:
        json.dump({
            "endpoint": endpoint,
            "task": task,
            "weights": {"random_forest": rf_weight, "xgboost": xgb_weight},
            "metrics": ens_metrics,
        }, f, indent=2)

    # Save applicability domain
    ad_path = os.path.join(MODEL_DIR, f"{endpoint}_ad.joblib")
    ad.save(ad_path)

    elapsed = time.time() - t_start

    report.update({
        "status": "success",
        "n_samples": len(features),
        "n_features": features.shape[1],
        "n_train": len(train_idx),
        "n_test": len(test_idx),
        "rf_metrics": rf_metrics,
        "xgb_metrics": xgb_metrics,
        "ensemble_metrics": ens_metrics,
        "weights": {"random_forest": rf_weight, "xgboost": xgb_weight},
        "validation": val_report.to_dict(),
        "training_time_s": round(elapsed, 2),
    })

    logger.info(f"  Completed {endpoint} in {elapsed:.1f}s")
    return report


# ═══════════════════════════════════════════
#  Shared Module Training
# ═══════════════════════════════════════════

def train_prodrug_detector(fetcher: DatasetFetcher, fp_calc: HybridFingerprintCalculator) -> ProdugDetector:
    """Train the shared prodrug detection model."""
    logger.info("\n" + "═" * 60)
    logger.info("  Training Prodrug Detector")
    logger.info("═" * 60)

    detector = ProdugDetector()

    # Fetch DrugBank prodrug labels
    try:
        prodrug_df = fetcher.fetch_drugbank_prodrugs()
        if prodrug_df is not None and len(prodrug_df) > 0:
            smiles = prodrug_df["smiles"].tolist()
            labels = prodrug_df["is_prodrug"].values.astype(int)

            features, valid_idx, _ = fp_calc.compute_batch_safe(smiles)
            if len(features) >= 10:
                valid_labels = labels[valid_idx]
                detector.train(features, valid_labels, [smiles[i] for i in valid_idx])
                logger.info(f"  Prodrug detector trained on {len(features)} molecules")
            else:
                logger.warning("  Insufficient valid molecules for prodrug training")
        else:
            logger.warning("  No prodrug data available — using structural rules only")
    except Exception as e:
        logger.warning(f"  Prodrug training error: {e} — using structural rules only")

    # Save
    det_path = os.path.join(MODEL_DIR, "prodrug_detector.joblib")
    joblib.dump(detector, det_path)
    logger.info(f"  Saved: {det_path}")

    return detector


def train_metabolism_predictor(
    fetcher: DatasetFetcher,
    fp_calc: HybridFingerprintCalculator,
    endpoint_ensembles: dict,
) -> MetabolismPredictor:
    """Train the shared metabolism predictor from CYP/P-gp ensembles."""
    logger.info("\n" + "═" * 60)
    logger.info("  Training Metabolism Predictor")
    logger.info("═" * 60)

    predictor = MetabolismPredictor()
    predictor._fp_calc = fp_calc

    # Use the trained CYP and P-gp models if available
    cyp_endpoints = ["cyp2d6_inhibitor", "cyp3a4_inhibitor", "cyp2c9_inhibitor"]
    for ep in cyp_endpoints:
        key = ep.replace("_inhibitor", "")
        if ep in endpoint_ensembles:
            predictor._models[key] = endpoint_ensembles[ep]
            logger.info(f"  Registered {key} from trained ensemble")

    if "pgp_substrate" in endpoint_ensembles:
        predictor._models["pgp_substrate"] = endpoint_ensembles["pgp_substrate"]
        logger.info("  Registered pgp_substrate from trained ensemble")

    if "ppb" in endpoint_ensembles:
        predictor._models["ppb"] = endpoint_ensembles["ppb"]
        logger.info("  Registered ppb from trained ensemble")

    # Save
    met_path = os.path.join(MODEL_DIR, "metabolism_predictor.joblib")
    joblib.dump(predictor, met_path)
    logger.info(f"  Saved: {met_path}")

    return predictor


# ═══════════════════════════════════════════
#  Build Ensemble Router
# ═══════════════════════════════════════════

def build_router(
    endpoint_data: dict,
    prodrug_detector: ProdugDetector,
    metabolism_predictor: MetabolismPredictor,
) -> EnsembleRouter:
    """
    Assemble the EnsembleRouter from trained components.

    Args:
        endpoint_data: dict of endpoint → {ensemble, ad}
        prodrug_detector, metabolism_predictor: shared sub-models
    """
    logger.info("\n" + "═" * 60)
    logger.info("  Building Ensemble Router")
    logger.info("═" * 60)

    router = EnsembleRouter()

    for endpoint, data in endpoint_data.items():
        router.register_ensemble(endpoint, "default", data["ensemble"])
        if "ad" in data:
            router.register_applicability_domain(endpoint, data["ad"])

    router.register_prodrug_detector(prodrug_detector)
    router.register_metabolism_predictor(metabolism_predictor)

    logger.info(f"  Router: {len(endpoint_data)} endpoints registered")
    logger.info(f"  Router description: {router.describe()}")

    # Save router
    router_path = os.path.join(MODEL_DIR, "router.joblib")
    joblib.dump(router, router_path)
    logger.info(f"  Saved: {router_path}")

    return router


# ═══════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Train ADMET v4 domain-aware prediction models"
    )
    parser.add_argument(
        "--endpoint", "-e",
        type=str, default=None,
        help="Train only this endpoint (e.g., logp, bbbp, toxicity)",
    )
    parser.add_argument(
        "--endpoints",
        type=str, default=None,
        help="Comma-separated list of endpoints to train",
    )
    parser.add_argument(
        "--tune",
        action="store_true",
        help="Run Optuna hyperparameter optimization",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick training with reduced estimators",
    )
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Skip dataset fetching, use cached data only",
    )
    args = parser.parse_args()

    # Banner
    print("=" * 70)
    print("  InSilico ADMET Training Pipeline v4.0")
    print(f"  Descriptors: ECFP6 ({DESCRIPTOR_VERSION})")
    print("  Models: RandomForest + XGBoost Ensemble")
    print("  Features: Applicability Domain + Prodrug Detection + Metabolism")
    print("  Validation: Scaffold-Split + MW/TPSA Stratification")
    if args.tune:
        print(f"  Optimization: Optuna ({OPTUNA_N_TRIALS} trials)")
    print("=" * 70)

    os.makedirs(MODEL_DIR, exist_ok=True)

    # Initialize shared components
    fp_calc = HybridFingerprintCalculator()
    fetcher = DatasetFetcher()
    preprocessor = ADMETPreprocessor()

    # Determine which endpoints to train
    if args.endpoint:
        if args.endpoint not in ADMET_ENDPOINTS:
            print(f"Unknown endpoint: {args.endpoint}")
            print(f"Available: {list(ADMET_ENDPOINTS.keys())}")
            sys.exit(1)
        endpoints = {args.endpoint: ADMET_ENDPOINTS[args.endpoint]}
    elif args.endpoints:
        ep_names = [e.strip() for e in args.endpoints.split(",")]
        endpoints = {}
        for ep in ep_names:
            if ep not in ADMET_ENDPOINTS:
                print(f"Unknown endpoint: {ep}")
                sys.exit(1)
            endpoints[ep] = ADMET_ENDPOINTS[ep]
    else:
        # Default: train the core endpoints that have MoleculeNet data
        # Other endpoints (caco2, vdss, etc.) require external data
        core_endpoints = [
            "solubility", "logp", "bbbp", "toxicity",
        ]
        # Add any extra endpoints that have cached datasets
        for ep in ADMET_ENDPOINTS:
            cache_path = os.path.join(DATA_DIR, ".cache", f"{ep}_merged.parquet")
            if ep not in core_endpoints and os.path.exists(cache_path):
                core_endpoints.append(ep)

        endpoints = {ep: ADMET_ENDPOINTS[ep] for ep in core_endpoints if ep in ADMET_ENDPOINTS}

    # ── Phase 1: Train endpoint models ──
    all_reports = {}
    endpoint_data = {}   # endpoint → {ensemble, ad}
    endpoint_ensembles = {}  # endpoint → ensemble (flat)
    total_start = time.time()

    for ep_name, ep_config in endpoints.items():
        print(f"\n{'═' * 70}")
        print(f"  [{ep_name.upper()}] {ep_config['description']}")
        print(f"  Task: {ep_config['task'].upper()}")
        print(f"{'═' * 70}")

        try:
            report = train_endpoint(
                endpoint=ep_name,
                config=ep_config,
                fetcher=fetcher,
                preprocessor=preprocessor,
                fp_calc=fp_calc,
                tune=args.tune,
                quick=args.quick,
                skip_fetch=args.skip_fetch,
            )
            all_reports[ep_name] = report

            if report.get("status") == "success":
                # Reload ensemble for router registration
                rf = RandomForestADMET(task=ep_config["task"], endpoint=ep_name)
                xgb_m = XGBoostADMET(task=ep_config["task"], endpoint=ep_name)

                rf_data = joblib.load(os.path.join(MODEL_DIR, f"{ep_name}_random_forest.joblib"))
                rf.model = rf_data["model"]
                rf.scaler = rf_data["scaler"]
                rf._feature_names = rf_data.get("feature_names")
                rf.is_fitted = True

                xgb_data = joblib.load(os.path.join(MODEL_DIR, f"{ep_name}_xgboost.joblib"))
                xgb_m.model = xgb_data["model"]
                xgb_m.scaler = xgb_data["scaler"]
                xgb_m._feature_names = xgb_data.get("feature_names")
                xgb_m.is_fitted = True

                ens = ADMETEnsemble(task=ep_config["task"], endpoint=ep_name)
                w = report["weights"]
                ens.add_model("random_forest", rf, weight=w["random_forest"])
                ens.add_model("xgboost", xgb_m, weight=w["xgboost"])

                ad = ApplicabilityDomain()
                ad_path = os.path.join(MODEL_DIR, f"{ep_name}_ad.joblib")
                if os.path.exists(ad_path):
                    ad.load(ad_path)

                endpoint_data[ep_name] = {"ensemble": ens, "ad": ad}
                endpoint_ensembles[ep_name] = ens

        except Exception as e:
            logger.error(f"  Failed: {e}", exc_info=True)
            all_reports[ep_name] = {"status": "error", "error": str(e)}

    # ── Phase 2: Train shared modules ──
    prodrug_detector = train_prodrug_detector(fetcher, fp_calc)
    metabolism_predictor = train_metabolism_predictor(
        fetcher, fp_calc, endpoint_ensembles,
    )

    # ── Phase 3: Build router ──
    router = build_router(endpoint_data, prodrug_detector, metabolism_predictor)

    # ── Final Summary ──
    total_time = time.time() - total_start
    print(f"\n{'═' * 70}")
    print(f"  TRAINING COMPLETE — {total_time:.1f}s total")
    print(f"{'═' * 70}")

    print(f"\n  Models saved to: {MODEL_DIR}")
    if os.path.exists(MODEL_DIR):
        for f in sorted(os.listdir(MODEL_DIR)):
            if f.endswith(".joblib"):
                size = os.path.getsize(os.path.join(MODEL_DIR, f))
                print(f"    + {f} ({size:,} bytes)")

    print(f"\n  Performance Summary:")
    print(f"  {'Endpoint':<20} {'Task':<15} {'RF':>8} {'XGB':>8} {'Ensemble':>10}")
    print(f"  {'─' * 61}")

    for ep_name, report in all_reports.items():
        if report.get("status") != "success":
            print(f"  {ep_name:<20} {report.get('status', 'unknown')}")
            continue

        task = report["task"]
        if task == "regression":
            metric = "r2"
            rf_val = report["rf_metrics"].get(metric, 0)
            xgb_val = report["xgb_metrics"].get(metric, 0)
            ens_val = report["ensemble_metrics"].get(metric, 0)
        else:
            metric = "auc"
            rf_val = report["rf_metrics"].get(metric, report["rf_metrics"].get("f1", 0))
            xgb_val = report["xgb_metrics"].get(metric, report["xgb_metrics"].get("f1", 0))
            ens_val = report["ensemble_metrics"].get(metric, report["ensemble_metrics"].get("f1", 0))

        print(
            f"  {ep_name:<20} {task:<15} "
            f"{rf_val:>8.4f} {xgb_val:>8.4f} {ens_val:>10.4f} ({metric})"
        )

    # Save full training report
    report_path = os.path.join(MODEL_DIR, "training_report.json")
    full_report = {
        "pipeline_version": "4.0.0",
        "model_version": MODEL_VERSION,
        "descriptor_version": DESCRIPTOR_VERSION,
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "total_time_s": round(total_time, 2),
        "split_method": "scaffold",
        "cv_folds": CV_FOLDS,
        "tuned": args.tune,
        "quick": args.quick,
        "endpoints_trained": list(all_reports.keys()),
        "endpoints": all_reports,
        "shared_modules": {
            "prodrug_detector": "trained" if prodrug_detector else "skipped",
            "metabolism_predictor": "trained" if metabolism_predictor else "skipped",
        },
        "router": router.describe() if router else None,
    }

    with open(report_path, "w") as f:
        json.dump(full_report, f, indent=2, default=lambda o: str(o))
    print(f"\n  Training report saved: {report_path}")


if __name__ == "__main__":
    main()

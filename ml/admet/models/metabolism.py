"""
metabolism.py — Metabolism-Aware Bioavailability Modelling
============================================================
Integrates CYP450 inhibition, P-glycoprotein substrate prediction,
plasma protein binding, and first-pass metabolism estimation into
the ADMET prediction pipeline.

Models:
  1. CYP450 Inhibition Prediction (CYP2D6, CYP3A4, CYP2C9)
  2. P-glycoprotein (P-gp) Substrate Classification
  3. Plasma Protein Binding (PPB) Prediction
  4. First-Pass Metabolism Estimation
  5. Metabolism-Corrected Bioavailability

Scientific rationale:
  Oral bioavailability is determined by:
    F = f_a × f_g × f_h
  Where:
    f_a = fraction absorbed (Caco-2, P-gp)
    f_g = fraction escaping gut-wall metabolism (CYP3A4)
    f_h = fraction escaping hepatic first-pass (CYP3A4, CYP2D6)

  For prodrugs, F is further modified by:
    - Esterase/amidase activation in gut wall
    - Phosphoramidate activation in hepatocytes
    - P-gp efflux of the prodrug form

  Standard QSPR models predict F directly, which fails for:
    - Large molecules (Remdesivir): low f_a due to size
    - P-gp substrates: f_a reduced by efflux
    - CYP3A4 substrates: f_g and f_h reduced
    - Prodrugs: activity depends on metabolism, not F per se
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, Lipinski

from .base import ADMETModel, RandomForestADMET, XGBoostADMET
from ..features.hybrid_fingerprints import HybridFingerprintCalculator

logger = logging.getLogger("admet.models.metabolism")


@dataclass
class MetabolismProfile:
    """Complete metabolism profile for a molecule."""

    # CYP450 inhibition
    cyp2d6_inhibitor: bool = False
    cyp2d6_probability: float = 0.0
    cyp3a4_inhibitor: bool = False
    cyp3a4_probability: float = 0.0
    cyp2c9_inhibitor: bool = False
    cyp2c9_probability: float = 0.0

    # P-glycoprotein
    pgp_substrate: bool = False
    pgp_probability: float = 0.0

    # Plasma protein binding
    ppb_fraction: float = 0.5       # 0.0–1.0 (fraction bound)
    ppb_confidence: float = 0.0

    # First-pass metabolism
    first_pass_fraction: float = 0.5  # Fraction surviving first-pass
    first_pass_confidence: float = 0.0

    # Bioavailability components
    fraction_absorbed: float = 0.5
    fraction_gut_available: float = 0.8
    fraction_hepatic_available: float = 0.7
    estimated_bioavailability: float = 0.3

    # Heuristic quality flag
    uses_heuristic: bool = True
    confidence: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "cyp_inhibition": {
                "cyp2d6": {"inhibitor": self.cyp2d6_inhibitor, "probability": round(self.cyp2d6_probability, 3)},
                "cyp3a4": {"inhibitor": self.cyp3a4_inhibitor, "probability": round(self.cyp3a4_probability, 3)},
                "cyp2c9": {"inhibitor": self.cyp2c9_inhibitor, "probability": round(self.cyp2c9_probability, 3)},
            },
            "pgp": {"substrate": self.pgp_substrate, "probability": round(self.pgp_probability, 3)},
            "ppb": {"fraction_bound": round(self.ppb_fraction, 3), "confidence": round(self.ppb_confidence, 3)},
            "first_pass": {
                "fraction_surviving": round(self.first_pass_fraction, 3),
                "confidence": round(self.first_pass_confidence, 3),
            },
            "bioavailability": {
                "fraction_absorbed": round(self.fraction_absorbed, 3),
                "fraction_gut_available": round(self.fraction_gut_available, 3),
                "fraction_hepatic_available": round(self.fraction_hepatic_available, 3),
                "estimated_F": round(self.estimated_bioavailability, 3),
            },
            "uses_heuristic": self.uses_heuristic,
            "confidence": round(self.confidence, 3),
        }


class MetabolismPredictor:
    """
    Integrated metabolism prediction system.

    Trains separate models for:
      - CYP2D6/CYP3A4/CYP2C9 inhibition (classification)
      - P-gp substrate status (classification)
      - Plasma protein binding (regression)

    Combines predictions into a first-pass metabolism estimate
    and metabolism-corrected oral bioavailability.

    If ML models are not trained, falls back to heuristic estimation
    based on physicochemical properties (Lipinski + TPSA + LogP rules).
    """

    def __init__(self):
        self._fp_calc = HybridFingerprintCalculator()
        self._models: Dict[str, ADMETModel] = {}
        self._fitted_endpoints: set = set()

    def fit_endpoint(
        self,
        endpoint: str,
        training_smiles: List[str],
        training_labels: np.ndarray,
        model_type: str = "xgboost",
    ) -> Dict:
        """
        Train a model for a specific metabolism endpoint.

        Endpoints: cyp2d6_inhibitor, cyp3a4_inhibitor, cyp2c9_inhibitor,
                   pgp_substrate, ppb
        """
        features, valid_idx, _ = self._fp_calc.compute_batch_safe(training_smiles)
        if len(features) == 0:
            raise ValueError(f"No valid molecules for {endpoint}")

        valid_labels = training_labels[valid_idx]

        # Determine task
        task = "regression" if endpoint == "ppb" else "classification"

        # Build model
        ModelClass = XGBoostADMET if model_type == "xgboost" else RandomForestADMET
        model = ModelClass(task=task, endpoint=endpoint)
        stats = model.fit(features, valid_labels)

        self._models[endpoint] = model
        self._fitted_endpoints.add(endpoint)

        logger.info(f"  Metabolism/{endpoint}: trained ({stats['n_samples']} samples)")
        return stats

    def predict_profile(self, smiles: str) -> MetabolismProfile:
        """
        Generate a complete metabolism profile for a molecule.

        Uses ML models when available, falls back to heuristics.
        """
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return MetabolismProfile()

        profile = MetabolismProfile()

        # Compute features once
        try:
            features = self._fp_calc.compute(smiles).reshape(1, -1)
        except Exception:
            features = None

        # ── CYP450 Inhibition ──
        for cyp, attr_prob, attr_bool in [
            ("cyp2d6_inhibitor", "cyp2d6_probability", "cyp2d6_inhibitor"),
            ("cyp3a4_inhibitor", "cyp3a4_probability", "cyp3a4_inhibitor"),
            ("cyp2c9_inhibitor", "cyp2c9_probability", "cyp2c9_inhibitor"),
        ]:
            if cyp in self._fitted_endpoints and features is not None:
                proba = self._models[cyp].predict_proba(features)
                prob = float(proba[0, 1])
                setattr(profile, attr_prob, prob)
                setattr(profile, attr_bool, prob > 0.5)
            else:
                # Heuristic: lipophilic, large aromatic system → CYP inhibitor
                logp = Crippen.MolLogP(mol)
                n_aromatic = Descriptors.NumAromaticRings(mol)
                mw = Descriptors.MolWt(mol)
                prob = 0.2
                if logp > 3.0 and n_aromatic >= 2:
                    prob = 0.6
                if mw > 400 and logp > 4.0:
                    prob = 0.7
                setattr(profile, attr_prob, prob)
                setattr(profile, attr_bool, prob > 0.5)

        # ── P-glycoprotein Substrate ──
        if "pgp_substrate" in self._fitted_endpoints and features is not None:
            proba = self._models["pgp_substrate"].predict_proba(features)
            profile.pgp_probability = float(proba[0, 1])
            profile.pgp_substrate = profile.pgp_probability > 0.5
        else:
            # Heuristic: MW > 400, TPSA > 75, LogP 2-5 → likely P-gp substrate
            mw = Descriptors.MolWt(mol)
            tpsa = Descriptors.TPSA(mol)
            logp = Crippen.MolLogP(mol)
            prob = 0.3
            if mw > 400 and tpsa > 75:
                prob = 0.6
            if mw > 600:
                prob = 0.75
            if logp > 2.0 and logp < 5.0 and mw > 400:
                prob += 0.1
            profile.pgp_probability = min(prob, 1.0)
            profile.pgp_substrate = prob > 0.5

        # ── Plasma Protein Binding ──
        if "ppb" in self._fitted_endpoints and features is not None:
            pred, unc = self._models["ppb"].predict_with_uncertainty(features)
            profile.ppb_fraction = float(np.clip(pred[0], 0, 1))
            profile.ppb_confidence = float(1.0 - unc[0])
        else:
            # Heuristic: high LogP → high binding
            logp = Crippen.MolLogP(mol)
            profile.ppb_fraction = np.clip(0.5 + logp * 0.1, 0.3, 0.99)
            profile.ppb_confidence = 0.3

        # ── First-Pass Metabolism Estimation ──
        profile.first_pass_fraction = self._estimate_first_pass(mol, profile)

        # ── Bioavailability Components ──
        profile.fraction_absorbed = self._estimate_absorption(mol, profile)
        profile.fraction_gut_available = self._estimate_gut_availability(mol, profile)
        profile.fraction_hepatic_available = self._estimate_hepatic_availability(mol, profile)

        # F = f_a × f_g × f_h
        profile.estimated_bioavailability = (
            profile.fraction_absorbed
            * profile.fraction_gut_available
            * profile.fraction_hepatic_available
        )

        profile.uses_heuristic = len(self._fitted_endpoints) == 0
        profile.confidence = self._overall_confidence(profile)

        return profile

    def _estimate_first_pass(self, mol: Chem.Mol, profile: MetabolismProfile) -> float:
        """
        Estimate fraction surviving first-pass metabolism.

        Based on CYP3A4 inhibition (as proxy for substrate likelihood)
        and general metabolic vulnerability.
        """
        # CYP3A4 is the dominant first-pass enzyme (responsible for ~50% of drug metabolism)
        # If the molecule is a CYP3A4 substrate (not inhibitor), first-pass is higher
        cyp3a4_vulnerability = profile.cyp3a4_probability

        mw = Descriptors.MolWt(mol)
        logp = Crippen.MolLogP(mol)
        n_rot = Descriptors.NumRotatableBonds(mol)

        # Base first-pass survival
        f_h = 0.7

        # Large molecules: more sites for metabolism
        if mw > 500:
            f_h -= 0.1
        if mw > 700:
            f_h -= 0.1

        # Highly lipophilic: more hepatic extraction
        if logp > 4.0:
            f_h -= 0.1
        if logp > 5.0:
            f_h -= 0.1

        # Flexible molecules: more metabolically vulnerable
        if n_rot > 10:
            f_h -= 0.05

        # CYP3A4 substrate → more first-pass metabolism
        f_h -= cyp3a4_vulnerability * 0.2

        return float(np.clip(f_h, 0.1, 0.95))

    def _estimate_absorption(self, mol: Chem.Mol, profile: MetabolismProfile) -> float:
        """Estimate fraction absorbed from GI tract."""
        mw = Descriptors.MolWt(mol)
        tpsa = Descriptors.TPSA(mol)
        logp = Crippen.MolLogP(mol)
        hbd = Descriptors.NumHDonors(mol)

        f_a = 0.85  # Base absorption for drug-like molecules

        # MW effect on absorption (paracellular cutoff ~500 Da)
        if mw > 500:
            f_a -= (mw - 500) * 0.001  # Linear decrease
        if mw > 700:
            f_a -= 0.15  # Major penalty for large molecules

        # TPSA effect (>140 Å² → poor oral absorption)
        if tpsa > 140:
            f_a -= (tpsa - 140) * 0.003

        # LogP extremes
        if logp < 0:
            f_a -= abs(logp) * 0.05  # Too hydrophilic
        if logp > 5:
            f_a -= (logp - 5) * 0.05  # Too lipophilic (dissolution-limited)

        # HBD effect (>5 → poor membrane permeation)
        if hbd > 5:
            f_a -= (hbd - 5) * 0.05

        # P-gp efflux reduces net absorption
        if profile.pgp_substrate:
            f_a *= (1.0 - profile.pgp_probability * 0.3)

        return float(np.clip(f_a, 0.01, 0.99))

    def _estimate_gut_availability(self, mol: Chem.Mol, profile: MetabolismProfile) -> float:
        """Estimate fraction escaping gut-wall metabolism."""
        # CYP3A4 is expressed in intestinal epithelium
        f_g = 0.85

        # CYP3A4 substrates undergo gut-wall metabolism
        if profile.cyp3a4_probability > 0.5:
            f_g -= profile.cyp3a4_probability * 0.2

        mw = Descriptors.MolWt(mol)
        if mw > 600:
            f_g -= 0.05  # Larger molecules have more metabolic sites

        return float(np.clip(f_g, 0.3, 0.95))

    def _estimate_hepatic_availability(self, mol: Chem.Mol, profile: MetabolismProfile) -> float:
        """Estimate fraction escaping hepatic first-pass metabolism."""
        return profile.first_pass_fraction

    def _overall_confidence(self, profile: MetabolismProfile) -> float:
        """Compute overall confidence in the metabolism profile."""
        if len(self._fitted_endpoints) == 0:
            return 0.25  # Pure heuristic

        # Each fitted endpoint adds confidence
        max_possible = 5  # cyp2d6, cyp3a4, cyp2c9, pgp, ppb
        fraction_fitted = len(self._fitted_endpoints) / max_possible
        return 0.3 + fraction_fitted * 0.6

    def save(self, dirpath: str) -> None:
        """Save all metabolism models."""
        import os
        import joblib
        os.makedirs(dirpath, exist_ok=True)
        for endpoint, model in self._models.items():
            filepath = os.path.join(dirpath, f"metabolism_{endpoint}.joblib")
            joblib.dump(model, filepath)
        logger.info(f"  Metabolism models saved to {dirpath}")

    def load(self, dirpath: str) -> None:
        """Load metabolism models from directory."""
        import os
        import joblib
        if not os.path.exists(dirpath):
            logger.warning(f"  Metabolism model dir not found: {dirpath}")
            return

        for filename in os.listdir(dirpath):
            if filename.startswith("metabolism_") and filename.endswith(".joblib"):
                endpoint = filename.replace("metabolism_", "").replace(".joblib", "")
                filepath = os.path.join(dirpath, filename)
                try:
                    self._models[endpoint] = joblib.load(filepath)
                    self._fitted_endpoints.add(endpoint)
                    logger.info(f"  Loaded metabolism model: {endpoint}")
                except Exception as e:
                    logger.warning(f"  Failed to load {filename}: {e}")

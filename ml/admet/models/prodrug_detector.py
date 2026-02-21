"""
prodrug_detector.py — Prodrug Detection Submodel
====================================================
Binary classifier to detect prodrug molecules using:
  1. Structural indicators (SMARTS patterns)
  2. ML classification (trained on DrugBank-derived labels)
  3. Substructure-specific rules (phosphoramidate, ester, carbamate)

If a molecule is classified as a prodrug:
  - Bioavailability prediction pathway is adjusted
  - Metabolism-aware corrections are triggered
  - The active metabolite is estimated (if possible)

Key prodrug classes detected:
  - Ester prodrugs (e.g., Enalapril → Enalaprilat)
  - Phosphoramidate prodrugs (e.g., Sofosbuvir, Remdesivir)
  - Carbamate prodrugs
  - Masked polar functionalities

Scientific rationale:
  Prodrugs are inactive precursors that undergo enzymatic conversion
  to active drugs in vivo. Their ADMET properties (especially oral
  bioavailability) differ fundamentally from simple drugs because:
    1. The intact prodrug may have different membrane permeability
    2. First-pass metabolism converts the prodrug to active form
    3. Standard QSPR models trained on active drugs fail on prodrugs
  Detecting prodrugs allows routing to a metabolism-aware pathway.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors

from .base import RandomForestADMET, XGBoostADMET
from ..features.hybrid_fingerprints import HybridFingerprintCalculator

logger = logging.getLogger("admet.models.prodrug")


@dataclass
class ProdugAssessment:
    """Result of prodrug classification."""

    is_prodrug: bool
    probability: float          # 0.0–1.0
    prodrug_type: str           # "phosphoramidate", "ester", "carbamate", "unknown", "none"
    confidence: float           # 0.0–1.0
    structural_flags: Dict      # Per-pattern match results
    recommendation: str         # Action recommendation

    def to_dict(self) -> Dict:
        return {
            "is_prodrug": self.is_prodrug,
            "probability": round(self.probability, 4),
            "prodrug_type": self.prodrug_type,
            "confidence": round(self.confidence, 4),
            "structural_flags": self.structural_flags,
            "recommendation": self.recommendation,
        }


class ProdugDetector:
    """
    Hybrid prodrug detection: structural rules + ML classifier.

    The structural rule engine provides interpretable binary flags.
    The ML model provides calibrated probability.
    Combined assessment uses both signals.

    Usage:
        detector = ProdugDetector()
        detector.fit(training_smiles, training_labels)

        assessment = detector.assess("CCC(CC)COC(=O)...")
        if assessment.is_prodrug:
            # Route to metabolism-aware bioavailability model
    """

    def __init__(self):
        self._fp_calc = HybridFingerprintCalculator()
        self._model: Optional[RandomForestADMET] = None
        self._is_fitted = False

        # SMARTS patterns for prodrug moieties
        self._patterns = self._compile_patterns()

    def _compile_patterns(self) -> Dict[str, Chem.Mol]:
        """Compile SMARTS for prodrug-relevant functional groups."""
        smarts = {
            # Phosphoramidate ProTide motif:
            # P(=O)(NR)(OR)(OAr) — characteristic of nucleotide prodrugs
            "phosphoramidate": "[P](=O)([NX3])([OX2])[OX2]",

            # Simple ester: R-C(=O)-O-R'
            # Many prodrugs use ester linkages for hydrolytic activation
            "ester_linkage": "[CX3](=O)[OX2H0][CX4]",

            # Anhydride: R-C(=O)-O-C(=O)-R'
            "anhydride": "[CX3](=O)[OX2][CX3](=O)",

            # Carbamate: R-N-C(=O)-O-R'
            "carbamate": "[NX3][CX3](=[OX1])[OX2][#6]",

            # Phosphate ester (nucleotide prodrugs)
            "phosphate_ester": "[P](=O)([OX2][#6])([OX2])[OX2]",

            # N-acyloxymethyl: masked amine
            "n_acyloxymethyl": "[NX3][CH2][OX2][CX3]=O",

            # Azo prodrug: R-N=N-R' (colon-targeted)
            "azo_linkage": "[#6][NX2]=[NX2][#6]",

            # Imine/Schiff base: masked aldehyde
            "imine": "[CX3]=[NX2][#6]",

            # Cyclic phosphoramidate (more specific ProTide)
            "protide": "[P](=O)([NH]C([#6])C(=O)O[#6])(Oc1ccccc1)[OX2]",

            # Nucleoside sugar (ribose/deoxyribose with base)
            "nucleoside_sugar": "[OX2]1[CX4][CX4]([OX2,NX3])[CX4][CX4]1",

            # Masked carboxyl (ester of acid)
            "masked_carboxyl": "[CX3](=O)[OX2][CX4,c]",
        }

        compiled = {}
        for name, pattern in smarts.items():
            mol = Chem.MolFromSmarts(pattern)
            if mol is not None:
                compiled[name] = mol
        return compiled

    def _structural_analysis(self, smiles: str) -> Dict:
        """
        Run structural rule-based analysis for prodrug moieties.

        Returns dict of pattern_name → {matched: bool, count: int}
        """
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return {}

        results = {}
        for name, pattern in self._patterns.items():
            try:
                matches = mol.GetSubstructMatches(pattern)
                results[name] = {
                    "matched": len(matches) > 0,
                    "count": len(matches),
                }
            except Exception:
                results[name] = {"matched": False, "count": 0}

        return results

    def _classify_prodrug_type(self, structural_flags: Dict) -> str:
        """Determine the specific prodrug type from structural analysis."""
        if structural_flags.get("phosphoramidate", {}).get("matched"):
            return "phosphoramidate"
        if structural_flags.get("protide", {}).get("matched"):
            return "phosphoramidate"  # ProTide is a subtype
        if structural_flags.get("phosphate_ester", {}).get("matched"):
            return "phosphate_ester"
        if structural_flags.get("carbamate", {}).get("matched"):
            return "carbamate"
        if structural_flags.get("ester_linkage", {}).get("matched"):
            return "ester"
        if structural_flags.get("azo_linkage", {}).get("matched"):
            return "azo"
        if structural_flags.get("n_acyloxymethyl", {}).get("matched"):
            return "n_acyloxymethyl"
        return "unknown"

    def fit(
        self,
        training_smiles: List[str],
        training_labels: np.ndarray,
    ) -> Dict:
        """
        Train the ML-based prodrug classifier.

        Args:
            training_smiles: SMILES strings
            training_labels: Binary labels (1=prodrug, 0=non-prodrug)

        Returns:
            Training statistics
        """
        # Compute features
        features, valid_idx, invalid = self._fp_calc.compute_batch_safe(training_smiles)

        if len(features) == 0:
            raise ValueError("No valid molecules in training set")

        valid_labels = training_labels[valid_idx]

        # Add structural flags as additional features
        structural_features = []
        for i in valid_idx:
            flags = self._structural_analysis(training_smiles[i])
            flag_vec = [
                float(flags.get(p, {}).get("matched", False))
                for p in self._patterns.keys()
            ]
            structural_features.append(flag_vec)
        structural_features = np.array(structural_features, dtype=np.float32)

        # Combine fingerprint + structural features
        X_combined = np.hstack([features, structural_features])

        # Train Random Forest (good for interpretability + calibration)
        self._model = RandomForestADMET(
            task="classification",
            endpoint="prodrug",
            params={"n_estimators": 500, "max_depth": 15},
        )
        stats = self._model.fit(X_combined, valid_labels)
        self._is_fitted = True

        logger.info(f"  Prodrug detector trained: {stats}")
        return stats

    def assess(self, smiles: str) -> ProdugAssessment:
        """
        Assess whether a molecule is a prodrug.

        Combines structural analysis with ML prediction.
        """
        # Structural analysis (always available)
        structural_flags = self._structural_analysis(smiles)
        prodrug_type = self._classify_prodrug_type(structural_flags)

        # Count positive structural signals
        positive_flags = sum(
            1 for f in structural_flags.values() if f.get("matched", False)
        )
        structural_score = min(positive_flags / 3.0, 1.0)  # 3+ flags → 1.0

        # ML prediction (if model is fitted)
        ml_probability = 0.5
        ml_confidence = 0.0

        if self._is_fitted:
            try:
                features = self._fp_calc.compute(smiles).reshape(1, -1)

                # Add structural flags
                flag_vec = np.array([
                    float(structural_flags.get(p, {}).get("matched", False))
                    for p in self._patterns.keys()
                ], dtype=np.float32).reshape(1, -1)

                X = np.hstack([features, flag_vec])
                proba = self._model.predict_proba(X)
                ml_probability = float(proba[0, 1])
                _, unc = self._model.predict_with_uncertainty(X)
                ml_confidence = float(1.0 - unc[0])
            except Exception as e:
                logger.warning(f"  Prodrug ML prediction failed: {e}")

        # Combined assessment
        # Weight: 40% structural rules, 60% ML if available
        if self._is_fitted:
            combined_prob = 0.4 * structural_score + 0.6 * ml_probability
            confidence = max(ml_confidence, 0.5) if ml_confidence > 0 else 0.5
        else:
            combined_prob = structural_score
            confidence = 0.3 + structural_score * 0.4

        is_prodrug = combined_prob > 0.5

        # Determine recommendation
        if is_prodrug and prodrug_type == "phosphoramidate":
            recommendation = (
                "Phosphoramidate prodrug detected. Use IV bioavailability model. "
                "First-pass metabolism will convert ProTide to active nucleotide."
            )
        elif is_prodrug and prodrug_type == "ester":
            recommendation = (
                "Ester prodrug detected. Apply esterase-mediated hydrolysis correction "
                "to bioavailability prediction."
            )
        elif is_prodrug:
            recommendation = (
                f"Prodrug detected (type: {prodrug_type}). Route to metabolism-aware "
                f"bioavailability model."
            )
        else:
            recommendation = "Not a prodrug. Use standard ADMET prediction pipeline."
            prodrug_type = "none"

        return ProdugAssessment(
            is_prodrug=is_prodrug,
            probability=combined_prob,
            prodrug_type=prodrug_type,
            confidence=confidence,
            structural_flags={
                k: v["matched"] for k, v in structural_flags.items()
            },
            recommendation=recommendation,
        )

    def save(self, filepath: str) -> None:
        """Save the prodrug detector model."""
        import joblib
        state = {
            "model": self._model,
            "is_fitted": self._is_fitted,
            "pattern_names": list(self._patterns.keys()),
        }
        joblib.dump(state, filepath)

    def load(self, filepath: str) -> None:
        """Load a saved prodrug detector model."""
        import joblib
        state = joblib.load(filepath)
        self._model = state["model"]
        self._is_fitted = state["is_fitted"]

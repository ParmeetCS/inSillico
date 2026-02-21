"""
ensemble.py — ADMET Weighted Ensemble with Uncertainty Quantification
========================================================================
Enhanced ensemble combining RF + XGBoost with:
  - Per-property reference scales
  - Domain-aware uncertainty inflation
  - Calibrated confidence scores
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple

from .base import ADMETModel
from ..config import ADMET_ENDPOINTS

logger = logging.getLogger("admet.models.ensemble")


class ADMETEnsemble:
    """
    Weighted ensemble of ADMET models with domain-aware uncertainty.

    Extends QSPR v2 ensemble with:
      - Applicability domain uncertainty multiplier
      - Prodrug-aware confidence adjustment
      - Per-property reference scales
    """

    def __init__(self, task: str, endpoint: str = ""):
        if task not in ("regression", "classification"):
            raise ValueError(f"task must be 'regression' or 'classification'")
        self.task = task
        self.endpoint = endpoint
        self.models: Dict[str, ADMETModel] = {}
        self.weights: Dict[str, float] = {}
        self.is_fitted = False

        # Reference scale for normalizing uncertainty
        ep_cfg = ADMET_ENDPOINTS.get(endpoint, {})
        self._ref_scale = ep_cfg.get("reference_scale", 2.0)

    def add_model(self, name: str, model: ADMETModel, weight: float = 0.5):
        if not model.is_fitted:
            raise ValueError(f"Model '{name}' must be fitted.")
        self.models[name] = model
        self.weights[name] = weight
        self.is_fitted = True

    def set_weights_from_performance(self, scores: Dict[str, float]):
        total = sum(max(s, 0.01) for s in scores.values())
        for name, score in scores.items():
            if name in self.weights:
                self.weights[name] = max(score, 0.01) / total

    def predict(
        self,
        X: np.ndarray,
        domain_multiplier: float = 1.0,
    ) -> Dict:
        """
        Ensemble prediction with domain-aware uncertainty.

        Args:
            X: Feature matrix
            domain_multiplier: Uncertainty inflation from applicability domain
                              (1.0 = inside domain, >1.0 = borderline/outside)
        """
        if not self.is_fitted:
            raise RuntimeError("Ensemble has no fitted models.")

        # Normalize weights
        total_w = sum(self.weights[n] for n in self.models)
        norm_w = {n: self.weights[n] / total_w for n in self.models}

        # Collect predictions
        all_preds = {}
        all_uncs = {}
        for name, model in self.models.items():
            pred, unc = model.predict_with_uncertainty(X)
            all_preds[name] = pred
            all_uncs[name] = unc

        if self.task == "regression":
            return self._regression_ensemble(all_preds, all_uncs, norm_w, domain_multiplier)
        else:
            return self._classification_ensemble(X, all_preds, all_uncs, norm_w, domain_multiplier)

    def _regression_ensemble(self, predictions, uncertainties, weights, domain_mult):
        weighted_pred = np.zeros_like(list(predictions.values())[0])
        for name, pred in predictions.items():
            weighted_pred += weights[name] * pred

        pred_stack = np.array(list(predictions.values()))
        ensemble_var = np.var(pred_stack, axis=0)
        avg_intra = np.mean([uncertainties[n] for n in uncertainties], axis=0)
        total_unc = np.sqrt(ensemble_var + avg_intra ** 2)

        # Apply domain multiplier
        total_unc *= domain_mult

        confidence = 1.0 - np.clip(total_unc / self._ref_scale, 0, 1)

        return {
            "prediction": weighted_pred,
            "uncertainty": total_unc,
            "confidence": confidence,
            "ensemble_variance": ensemble_var,
            "individual_predictions": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in predictions.items()
            },
            "individual_uncertainties": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in uncertainties.items()
            },
        }

    def _classification_ensemble(self, X, predictions, uncertainties, weights, domain_mult):
        weighted_proba = None
        for name, model in self.models.items():
            proba = model.predict_proba(X)
            if weighted_proba is None:
                weighted_proba = weights[name] * proba
            else:
                weighted_proba += weights[name] * proba

        final_class = np.argmax(weighted_proba, axis=1)
        max_proba = np.max(weighted_proba, axis=1)

        proba_stack = np.array([
            model.predict_proba(X)[:, 1] for model in self.models.values()
        ])
        ensemble_var = np.var(proba_stack, axis=0)

        # Domain-corrected confidence
        confidence = max_proba * (1.0 - np.sqrt(ensemble_var))
        confidence /= domain_mult
        confidence = np.clip(confidence, 0, 1)

        return {
            "prediction": final_class,
            "probability": weighted_proba[:, 1] if weighted_proba.shape[1] > 1 else max_proba,
            "uncertainty": np.sqrt(ensemble_var) * domain_mult,
            "confidence": confidence,
            "ensemble_variance": ensemble_var,
            "individual_predictions": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in predictions.items()
            },
        }

    def predict_single(self, X: np.ndarray, domain_multiplier: float = 1.0) -> Dict:
        """Convenience: predict for single molecule, return scalars."""
        result = self.predict(X, domain_multiplier)
        scalar = {}
        for key, val in result.items():
            if isinstance(val, np.ndarray):
                scalar[key] = float(val[0]) if val.size == 1 else val.tolist()
            elif isinstance(val, dict):
                scalar[key] = val
            else:
                scalar[key] = val
        return scalar

    def describe(self) -> Dict:
        return {
            "type": "ADMETEnsemble",
            "endpoint": self.endpoint,
            "task": self.task,
            "models": list(self.models.keys()),
            "weights": {k: round(v, 4) for k, v in self.weights.items()},
        }

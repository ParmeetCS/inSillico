"""
ensemble.py — Weighted Ensemble with Uncertainty Estimation
=============================================================
Combines RandomForest + XGBoost predictions using performance-weighted
averaging, with ensemble disagreement as a confidence signal.

Scientific rationale:
  In drug discovery, a single model's prediction should never be trusted
  without a confidence estimate. Ensemble disagreement quantifies
  epistemic uncertainty — how much the model "doesn't know" about a
  given molecule.

  High ensemble variance often indicates:
    1. The molecule is dissimilar to training data (applicability domain violation)
    2. The molecule lies near a decision boundary
    3. Conflicting structure-property signals

  This directly impacts go/no-go decisions in lead optimization.

Uncertainty interpretation:
  - Low variance  → High confidence → Safe to prioritize
  - High variance → Low confidence  → Needs experimental validation
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple

from .models import QSPRModel
from .config import DEFAULT_ENSEMBLE_WEIGHTS

logger = logging.getLogger("qspr.ensemble")

# Reference uncertainty scales (based on training RMSE × 2) used to
# normalise single-prediction confidence.  When only one sample is
# predicted the old code divided by max(uncertainty)==itself → 0.
# These per-property scales keep confidence meaningful for single
# molecules.  Scales are deliberately generous (2× RMSE) so that
# typical predictions land in the 0.4–0.9 confidence range.
_UNCERTAINTY_REF_SCALES: Dict[str, float] = {
    "logp": 2.0,       # training RMSE ≈ 0.95
    "solubility": 2.0,  # training RMSE ≈ 0.92
    "bbbp": 1.0,        # classification, scale on probability
    "toxicity": 1.0,    # classification, scale on probability
}


class QSPREnsemble:
    """
    Weighted ensemble of QSPR models with uncertainty quantification.

    The ensemble:
      1. Collects predictions from each constituent model.
      2. Weights predictions by model performance (e.g., R² or AUC).
      3. Computes inter-model variance as epistemic uncertainty.
      4. For classification, calibrates output as probability.

    Weights are set after cross-validation evaluation and can be
    updated as better models are trained.
    """

    def __init__(self, task: str, property_name: str = ""):
        if task not in ("regression", "classification"):
            raise ValueError(f"task must be 'regression' or 'classification'")

        self.task = task
        self.property_name = property_name
        self.models: Dict[str, QSPRModel] = {}
        self.weights: Dict[str, float] = {}
        self.is_fitted = False

    def add_model(
        self,
        name: str,
        model: QSPRModel,
        weight: float = 0.5,
    ) -> None:
        """
        Register a trained model in the ensemble.

        Args:
            name: Unique identifier (e.g., "random_forest", "xgboost")
            model: Trained QSPRModel instance
            weight: Contribution weight (will be normalized to sum=1)
        """
        if not model.is_fitted:
            raise ValueError(f"Model '{name}' must be fitted before adding to ensemble.")

        self.models[name] = model
        self.weights[name] = weight
        self.is_fitted = True

        logger.info(f"  Ensemble: added '{name}' (weight={weight:.3f})")

    def set_weights_from_performance(self, scores: Dict[str, float]) -> None:
        """
        Set ensemble weights proportional to model performance.

        Args:
            scores: Dict mapping model name → performance metric
                    (higher is better, e.g., R², AUC, accuracy)

        The weights are softmax-normalized so they sum to 1.
        """
        total = sum(max(s, 0.01) for s in scores.values())
        for name, score in scores.items():
            if name in self.weights:
                self.weights[name] = max(score, 0.01) / total

        logger.info(
            f"  Ensemble weights updated: "
            + ", ".join(f"{k}={v:.3f}" for k, v in self.weights.items())
        )

    def predict(self, X: np.ndarray) -> Dict:
        """
        Ensemble prediction with uncertainty.

        Returns a dict with:
          - prediction: Final weighted prediction
          - confidence: 1 - normalized_uncertainty (0 to 1)
          - uncertainty: Raw ensemble variance
          - individual_predictions: Per-model predictions
          - individual_uncertainties: Per-model uncertainty

        For classification:
          - prediction: int (class label)
          - probability: float (weighted average probability)
          - confidence: 1 - ensemble_entropy
        """
        if not self.is_fitted:
            raise RuntimeError("Ensemble has no fitted models.")

        # Normalize weights
        total_weight = sum(self.weights[n] for n in self.models)
        norm_weights = {
            n: self.weights[n] / total_weight for n in self.models
        }

        # Collect per-model predictions and uncertainties
        all_predictions = {}
        all_uncertainties = {}

        for name, model in self.models.items():
            pred, unc = model.predict_with_uncertainty(X)
            all_predictions[name] = pred
            all_uncertainties[name] = unc

        if self.task == "regression":
            return self._ensemble_regression(
                all_predictions, all_uncertainties, norm_weights
            )
        else:
            return self._ensemble_classification(
                X, all_predictions, all_uncertainties, norm_weights
            )

    def _ensemble_regression(
        self,
        predictions: Dict[str, np.ndarray],
        uncertainties: Dict[str, np.ndarray],
        weights: Dict[str, float],
    ) -> Dict:
        """Weighted average regression ensemble."""
        # Weighted prediction
        weighted_pred = np.zeros_like(list(predictions.values())[0])
        for name, pred in predictions.items():
            weighted_pred += weights[name] * pred

        # Inter-model variance (ensemble disagreement)
        pred_stack = np.array(list(predictions.values()))
        ensemble_variance = np.var(pred_stack, axis=0)

        # Average intra-model uncertainty
        avg_intra_unc = np.mean(
            [uncertainties[n] for n in uncertainties], axis=0
        )

        # Total uncertainty = sqrt(inter-model variance + mean intra-model variance)
        total_uncertainty = np.sqrt(ensemble_variance + avg_intra_unc ** 2)

        # Confidence: use a fixed reference scale so single-sample
        # predictions get meaningful confidence instead of always 0.
        ref_scale = _UNCERTAINTY_REF_SCALES.get(self.property_name, 2.0)
        confidence = 1.0 - np.clip(total_uncertainty / ref_scale, 0, 1)

        return {
            "prediction": weighted_pred,
            "uncertainty": total_uncertainty,
            "confidence": confidence,
            "ensemble_variance": ensemble_variance,
            "individual_predictions": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in predictions.items()
            },
            "individual_uncertainties": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in uncertainties.items()
            },
        }

    def _ensemble_classification(
        self,
        X: np.ndarray,
        predictions: Dict[str, np.ndarray],
        uncertainties: Dict[str, np.ndarray],
        weights: Dict[str, float],
    ) -> Dict:
        """Weighted probability ensemble for classification."""
        # Collect per-model probability predictions
        weighted_proba = None
        for name, model in self.models.items():
            proba = model.predict_proba(X)
            if weighted_proba is None:
                weighted_proba = weights[name] * proba
            else:
                weighted_proba += weights[name] * proba

        # Final class prediction
        final_class = np.argmax(weighted_proba, axis=1)
        max_proba = np.max(weighted_proba, axis=1)

        # Inter-model variance on positive class probability
        proba_stack = np.array([
            model.predict_proba(X)[:, 1] for model in self.models.values()
        ])
        ensemble_variance = np.var(proba_stack, axis=0)

        # Confidence = max probability (calibrated via ensemble agreement)
        confidence = max_proba * (1.0 - np.sqrt(ensemble_variance))
        confidence = np.clip(confidence, 0, 1)

        return {
            "prediction": final_class,
            "probability": weighted_proba[:, 1] if weighted_proba.shape[1] > 1 else max_proba,
            "uncertainty": np.sqrt(ensemble_variance),
            "confidence": confidence,
            "ensemble_variance": ensemble_variance,
            "individual_predictions": {
                k: v.tolist() if len(v) > 1 else float(v[0])
                for k, v in predictions.items()
            },
        }

    def predict_single(self, X: np.ndarray) -> Dict:
        """
        Predict for a single molecule (1 row).
        Returns scalar values instead of arrays.

        Convenience method for the Flask API.
        """
        result = self.predict(X)

        scalar_result = {}
        for key, val in result.items():
            if isinstance(val, np.ndarray):
                scalar_result[key] = float(val[0]) if val.size == 1 else val.tolist()
            elif isinstance(val, dict):
                scalar_result[key] = val
            else:
                scalar_result[key] = val

        return scalar_result

    def describe(self) -> Dict:
        """Return ensemble metadata for API responses."""
        return {
            "type": "WeightedEnsemble",
            "task": self.task,
            "models": list(self.models.keys()),
            "weights": {k: round(v, 4) for k, v in self.weights.items()},
            "n_models": len(self.models),
        }

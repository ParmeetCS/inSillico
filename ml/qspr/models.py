"""
models.py — QSPR Model Definitions (RandomForest + XGBoost)
=============================================================
Encapsulates scikit-learn and XGBoost models in a unified interface
for training, prediction, and per-tree uncertainty extraction.

Design decisions:
  - RandomForest for low-variance uncertainty estimates
    (each tree trains on a bootstrap sample — prediction variance
    across trees is a natural epistemic uncertainty measure).
  - XGBoost for peak accuracy
    (boosted ensembles minimize bias iteratively, typically achieving
    3-7% better R²/AUC than bagged ensembles on molecular data).
  - Both models share a common ABC interface for clean ensemble logic.
"""

import logging
import numpy as np
from abc import ABC, abstractmethod
from typing import Dict, Optional, Tuple
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor, XGBClassifier

from .config import DEFAULT_RF_PARAMS, DEFAULT_XGB_PARAMS

logger = logging.getLogger("qspr.models")


class QSPRModel(ABC):
    """
    Abstract base class for all QSPR models.

    Subclasses must implement:
      - _build_model() → sklearn-compatible estimator
      - predict_with_uncertainty() → (predictions, uncertainties)
    """

    def __init__(self, task: str, params: Optional[Dict] = None):
        if task not in ("regression", "classification"):
            raise ValueError(f"task must be 'regression' or 'classification', got '{task}'")

        self.task = task
        self.params = params or {}
        self.model = None
        self.scaler = StandardScaler()
        self.is_fitted = False
        self._feature_names = None

    @abstractmethod
    def _build_model(self):
        """Build the underlying sklearn/xgboost estimator."""
        pass

    @abstractmethod
    def predict_with_uncertainty(
        self, X: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with per-sample uncertainty estimates.

        Returns:
            (predictions, uncertainties) where both are 1D arrays
        """
        pass

    @property
    def name(self) -> str:
        return self.__class__.__name__

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        feature_names: Optional[list] = None,
    ) -> Dict:
        """
        Train the model: scale features, build estimator, fit.

        Args:
            X_train: Feature matrix (n_samples, n_features)
            y_train: Target array (n_samples,)
            feature_names: Optional list of feature names

        Returns:
            Dict with training metadata
        """
        self._feature_names = feature_names
        self.model = self._build_model()

        # Fit scaler on training data
        X_scaled = self.scaler.fit_transform(X_train)

        # Handle class imbalance for classification XGBoost
        if self.task == "classification" and hasattr(self.model, "scale_pos_weight"):
            n_pos = np.sum(y_train == 1)
            n_neg = np.sum(y_train == 0)
            if n_pos > 0 and n_neg > 0:
                self.model.set_params(scale_pos_weight=n_neg / n_pos)

        self.model.fit(X_scaled, y_train)
        self.is_fitted = True

        logger.info(f"  {self.name} trained on {len(y_train):,} samples")

        return {
            "model": self.name,
            "task": self.task,
            "n_samples": len(y_train),
            "n_features": X_train.shape[1],
        }

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Standard prediction (no uncertainty).

        Args:
            X: Feature matrix (n_samples, n_features)

        Returns:
            1D array of predictions
        """
        if not self.is_fitted:
            raise RuntimeError(f"{self.name} has not been fitted.")

        X_scaled = self.scaler.transform(X)

        if self.task == "classification":
            return self.model.predict(X_scaled)
        else:
            return self.model.predict(X_scaled)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Classification probability prediction.

        Returns:
            2D array of shape (n_samples, n_classes)
        """
        if self.task != "classification":
            raise ValueError("predict_proba only available for classification.")
        if not self.is_fitted:
            raise RuntimeError(f"{self.name} has not been fitted.")

        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)

    def get_feature_importance(self) -> Optional[np.ndarray]:
        """Return feature importance array if available."""
        if not self.is_fitted or self.model is None:
            return None
        if hasattr(self.model, "feature_importances_"):
            return self.model.feature_importances_
        return None


class RandomForestQSPR(QSPRModel):
    """
    RandomForest model with per-tree uncertainty estimation.

    Uncertainty is computed as the standard deviation of predictions
    across individual decision trees in the forest. This is a natural
    epistemic uncertainty measure: regions of feature space with few
    training examples produce more variable tree predictions.

    For classification, uncertainty = entropy of the averaged class
    probability across trees.
    """

    def __init__(self, task: str, params: Optional[Dict] = None):
        merged = {**DEFAULT_RF_PARAMS, **(params or {})}
        super().__init__(task, merged)

    def _build_model(self):
        if self.task == "regression":
            return RandomForestRegressor(**self.params)
        else:
            return RandomForestClassifier(**self.params)

    def predict_with_uncertainty(
        self, X: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with per-tree variance as uncertainty.

        For regression: uncertainty = std of per-tree predictions.
        For classification: uncertainty = 1 - max(class_probabilities).
        """
        if not self.is_fitted:
            raise RuntimeError("Model not fitted.")

        X_scaled = self.scaler.transform(X)

        if self.task == "regression":
            # Get individual tree predictions
            tree_preds = np.array([
                tree.predict(X_scaled) for tree in self.model.estimators_
            ])  # shape: (n_trees, n_samples)
            predictions = np.mean(tree_preds, axis=0)
            uncertainties = np.std(tree_preds, axis=0)
        else:
            # Average class probabilities across trees
            tree_probs = np.array([
                tree.predict_proba(X_scaled) for tree in self.model.estimators_
            ])  # shape: (n_trees, n_samples, n_classes)
            mean_probs = np.mean(tree_probs, axis=0)
            predictions = np.argmax(mean_probs, axis=1).astype(float)
            # Uncertainty = 1 - confidence of most probable class
            uncertainties = 1.0 - np.max(mean_probs, axis=1)

        return predictions, uncertainties


class XGBoostQSPR(QSPRModel):
    """
    XGBoost model with staged prediction uncertainty.

    For uncertainty estimation, we use the variance of predictions
    across boosting stages. Early stages capture broad patterns;
    later stages capture fine-grained corrections. High variance
    across stages indicates the model is uncertain about the sample.

    For classification, we use 1 - max(predicted probability) as
    the uncertainty measure.
    """

    def __init__(self, task: str, params: Optional[Dict] = None):
        merged = {**DEFAULT_XGB_PARAMS, **(params or {})}
        super().__init__(task, merged)

    def _build_model(self):
        if self.task == "regression":
            return XGBRegressor(**self.params)
        else:
            params = {**self.params}
            params["eval_metric"] = "logloss"
            return XGBClassifier(**params)

    def predict_with_uncertainty(
        self, X: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with boosting-stage variance as uncertainty.

        Uses staged predictions at 25%, 50%, 75%, 100% of boosting rounds
        to estimate prediction stability.
        """
        if not self.is_fitted:
            raise RuntimeError("Model not fitted.")

        X_scaled = self.scaler.transform(X)

        n_estimators = self.model.get_params().get("n_estimators", 100)
        checkpoints = [
            max(1, int(n_estimators * frac))
            for frac in [0.25, 0.5, 0.75, 1.0]
        ]
        # Remove duplicates while preserving order
        checkpoints = list(dict.fromkeys(checkpoints))

        if self.task == "regression":
            staged_preds = []
            for n_trees in checkpoints:
                pred = self.model.predict(
                    X_scaled, iteration_range=(0, n_trees)
                )
                staged_preds.append(pred)

            staged_preds = np.array(staged_preds)
            predictions = staged_preds[-1]  # Full model prediction
            uncertainties = np.std(staged_preds, axis=0)
        else:
            proba = self.model.predict_proba(X_scaled)
            predictions = np.argmax(proba, axis=1).astype(float)
            uncertainties = 1.0 - np.max(proba, axis=1)

        return predictions, uncertainties

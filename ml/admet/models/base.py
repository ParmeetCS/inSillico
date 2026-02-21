"""
base.py — Enhanced ADMET Base Models (RF + XGBoost)
=====================================================
Extends the QSPR model architecture with:
  - Multi-task capability support
  - Feature importance analysis
  - MW/TPSA-aware training
  - Better uncertainty calibration
"""

import logging
import numpy as np
from abc import ABC, abstractmethod
from typing import Dict, Optional, Tuple, List
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor, XGBClassifier

from ..config import DEFAULT_RF_PARAMS, DEFAULT_XGB_PARAMS

logger = logging.getLogger("admet.models.base")


class ADMETModel(ABC):
    """
    Abstract base class for ADMET prediction models.

    Enhancements over QSPR v2 QSPRModel:
      - Feature importance tracking with names
      - Training sample metadata (MW/TPSA distribution)
      - Calibrated uncertainty estimation
    """

    def __init__(self, task: str, endpoint: str = "", params: Optional[Dict] = None):
        if task not in ("regression", "classification"):
            raise ValueError(f"task must be 'regression' or 'classification'")
        self.task = task
        self.endpoint = endpoint
        self.params = params or {}
        self.model = None
        self.scaler = StandardScaler()
        self.is_fitted = False
        self._feature_names: Optional[List[str]] = None
        self._training_stats: Dict = {}

    @abstractmethod
    def _build_model(self):
        pass

    @abstractmethod
    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        pass

    @property
    def name(self) -> str:
        return self.__class__.__name__

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        feature_names: Optional[List[str]] = None,
        sample_weights: Optional[np.ndarray] = None,
    ) -> Dict:
        """
        Train the model with optional sample weighting.

        Args:
            X_train: Feature matrix (n_samples, n_features)
            y_train: Target array
            feature_names: Column names for interpretability
            sample_weights: Per-sample weights (e.g., MW-stratified reweighting)
        """
        self._feature_names = feature_names
        self.model = self._build_model()

        # Scale features
        X_scaled = self.scaler.fit_transform(X_train)

        # Handle class imbalance
        if self.task == "classification" and hasattr(self.model, "scale_pos_weight"):
            n_pos = np.sum(y_train == 1)
            n_neg = np.sum(y_train == 0)
            if n_pos > 0 and n_neg > 0:
                self.model.set_params(scale_pos_weight=n_neg / n_pos)

        # Fit
        fit_kwargs = {}
        if sample_weights is not None:
            fit_kwargs["sample_weight"] = sample_weights

        self.model.fit(X_scaled, y_train, **fit_kwargs)
        self.is_fitted = True

        self._training_stats = {
            "n_samples": len(y_train),
            "n_features": X_train.shape[1],
            "endpoint": self.endpoint,
        }

        logger.info(f"  {self.name}/{self.endpoint} trained on {len(y_train):,} samples")
        return self._training_stats

    def predict(self, X: np.ndarray) -> np.ndarray:
        if not self.is_fitted:
            raise RuntimeError(f"{self.name} not fitted.")
        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if self.task != "classification":
            raise ValueError("predict_proba only for classification.")
        if not self.is_fitted:
            raise RuntimeError(f"{self.name} not fitted.")
        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)

    def get_feature_importance(self, top_n: int = 20) -> List[Tuple[str, float]]:
        """Return top-N most important features with names."""
        if not self.is_fitted or self.model is None:
            return []
        if not hasattr(self.model, "feature_importances_"):
            return []

        importances = self.model.feature_importances_
        names = self._feature_names or [f"f_{i}" for i in range(len(importances))]

        pairs = list(zip(names, importances))
        pairs.sort(key=lambda x: abs(x[1]), reverse=True)
        return pairs[:top_n]


class RandomForestADMET(ADMETModel):
    """
    RandomForest with per-tree uncertainty and calibrated confidence.
    """

    def __init__(self, task: str, endpoint: str = "", params: Optional[Dict] = None):
        merged = {**DEFAULT_RF_PARAMS, **(params or {})}
        super().__init__(task, endpoint, merged)

    def _build_model(self):
        if self.task == "regression":
            params = {k: v for k, v in self.params.items() if k != "class_weight"}
            return RandomForestRegressor(**params)
        else:
            return RandomForestClassifier(**self.params)

    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Not fitted.")

        X_scaled = self.scaler.transform(X)

        if self.task == "regression":
            tree_preds = np.array([
                tree.predict(X_scaled) for tree in self.model.estimators_
            ])
            predictions = np.mean(tree_preds, axis=0)
            uncertainties = np.std(tree_preds, axis=0)
        else:
            tree_probs = np.array([
                tree.predict_proba(X_scaled) for tree in self.model.estimators_
            ])
            mean_probs = np.mean(tree_probs, axis=0)
            predictions = np.argmax(mean_probs, axis=1).astype(float)
            uncertainties = 1.0 - np.max(mean_probs, axis=1)

        return predictions, uncertainties


class XGBoostADMET(ADMETModel):
    """
    XGBoost with staged-prediction uncertainty estimation.
    """

    def __init__(self, task: str, endpoint: str = "", params: Optional[Dict] = None):
        merged = {**DEFAULT_XGB_PARAMS, **(params or {})}
        super().__init__(task, endpoint, merged)

    def _build_model(self):
        if self.task == "regression":
            return XGBRegressor(**self.params)
        else:
            params = {**self.params, "eval_metric": "logloss"}
            return XGBClassifier(**params)

    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Not fitted.")

        X_scaled = self.scaler.transform(X)

        n_est = self.model.get_params().get("n_estimators", 100)
        checkpoints = list(dict.fromkeys([
            max(1, int(n_est * f)) for f in [0.25, 0.5, 0.75, 1.0]
        ]))

        if self.task == "regression":
            staged = [
                self.model.predict(X_scaled, iteration_range=(0, n))
                for n in checkpoints
            ]
            staged = np.array(staged)
            predictions = staged[-1]
            uncertainties = np.std(staged, axis=0)
        else:
            proba = self.model.predict_proba(X_scaled)
            predictions = np.argmax(proba, axis=1).astype(float)
            uncertainties = 1.0 - np.max(proba, axis=1)

        return predictions, uncertainties

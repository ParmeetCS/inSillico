"""
evaluation.py — QSPR Model Evaluation Pipeline
=================================================
Implements cross-validation, metric computation, and structured
evaluation report generation for both regression and classification tasks.

Metrics:
  Regression:
    - R²  (coefficient of determination): Measures explained variance.
           R² > 0.7 is acceptable; > 0.8 is good; > 0.9 is excellent.
    - RMSE (root mean squared error): Penalizes large errors.
    - MAE  (mean absolute error): Average absolute deviation.

  Classification:
    - ROC-AUC: Area under the ROC curve. Threshold-independent.
               AUC > 0.8 is good; > 0.9 is excellent.
    - Accuracy: Fraction of correct predictions.
    - F1-score: Harmonic mean of precision and recall.
                Robust to class imbalance.

All metrics are computed on held-out test data using scaffold splits
to ensure scientifically valid evaluation.
"""

import logging
import time
import numpy as np
from typing import Dict, List, Optional, Tuple
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    accuracy_score, f1_score, roc_auc_score,
    precision_score, recall_score, confusion_matrix,
)

from .models import QSPRModel
from .ensemble import QSPREnsemble
from .splitting import ScaffoldSplitter

logger = logging.getLogger("qspr.evaluation")


class QSPREvaluator:
    """
    Evaluation engine for QSPR models and ensembles.

    Features:
      - Hold-out test evaluation
      - K-fold scaffold cross-validation
      - Metric computation for regression and classification
      - Structured evaluation reports
    """

    def __init__(self, task: str):
        if task not in ("regression", "classification"):
            raise ValueError(f"task must be 'regression' or 'classification'")
        self.task = task

    def evaluate_model(
        self,
        model: QSPRModel,
        X_test: np.ndarray,
        y_test: np.ndarray,
    ) -> Dict:
        """
        Evaluate a single model on a test set.

        Args:
            model: Trained QSPRModel
            X_test: Test features
            y_test: True test targets

        Returns:
            Dict with metric names → values
        """
        if self.task == "regression":
            y_pred = model.predict(X_test)
            return self._regression_metrics(y_test, y_pred)
        else:
            y_pred = model.predict(X_test)
            y_proba = model.predict_proba(X_test)[:, 1]
            return self._classification_metrics(y_test, y_pred, y_proba)

    def evaluate_ensemble(
        self,
        ensemble: QSPREnsemble,
        X_test: np.ndarray,
        y_test: np.ndarray,
    ) -> Dict:
        """
        Evaluate the full ensemble on a test set.

        Returns metrics + uncertainty calibration stats.
        """
        result = ensemble.predict(X_test)

        if self.task == "regression":
            y_pred = result["prediction"]
            metrics = self._regression_metrics(y_test, y_pred)
            metrics["mean_uncertainty"] = float(np.mean(result["uncertainty"]))
            metrics["mean_confidence"] = float(np.mean(result["confidence"]))
        else:
            y_pred = result["prediction"]
            y_proba = result["probability"]
            metrics = self._classification_metrics(y_test, y_pred, y_proba)
            metrics["mean_uncertainty"] = float(np.mean(result["uncertainty"]))
            metrics["mean_confidence"] = float(np.mean(result["confidence"]))

        return metrics

    def scaffold_cross_validate(
        self,
        model_cls,
        task: str,
        X: np.ndarray,
        y: np.ndarray,
        smiles_list: List[str],
        n_folds: int = 5,
        model_params: Optional[Dict] = None,
    ) -> Dict:
        """
        K-fold scaffold cross-validation.

        This is the gold standard for evaluating QSPR models in
        drug discovery. Random CV inflates metrics by 5-15%.

        Args:
            model_cls: QSPRModel class (e.g., RandomForestQSPR)
            task: "regression" or "classification"
            X: Full feature matrix
            y: Full target array
            smiles_list: SMILES strings (for scaffold computation)
            n_folds: Number of folds
            model_params: Optional hyperparameters

        Returns:
            Dict with per-fold and aggregated metrics
        """
        splitter = ScaffoldSplitter()
        folds = splitter.kfold_scaffold_split(smiles_list, n_folds)

        fold_metrics = []
        t0 = time.time()

        for fold_i, (train_idx, val_idx) in enumerate(folds):
            X_train, y_train = X[train_idx], y[train_idx]
            X_val, y_val = X[val_idx], y[val_idx]

            # Train fresh model for this fold
            model = model_cls(task=task, params=model_params)
            model.fit(X_train, y_train)

            # Evaluate
            metrics = self.evaluate_model(model, X_val, y_val)
            fold_metrics.append(metrics)

            logger.info(
                f"    Fold {fold_i + 1}/{n_folds}: "
                + ", ".join(
                    f"{k}={v:.4f}" for k, v in metrics.items()
                    if isinstance(v, (int, float))
                )
            )

        elapsed = time.time() - t0

        # Aggregate across folds
        agg = self._aggregate_fold_metrics(fold_metrics)
        agg["n_folds"] = n_folds
        agg["total_time_s"] = round(elapsed, 2)
        agg["per_fold"] = fold_metrics

        return agg

    def _regression_metrics(
        self, y_true: np.ndarray, y_pred: np.ndarray
    ) -> Dict:
        """Compute regression evaluation metrics."""
        r2 = r2_score(y_true, y_pred)
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        mae = float(mean_absolute_error(y_true, y_pred))

        return {
            "r2": round(float(r2), 4),
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
        }

    def _classification_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_proba: np.ndarray,
    ) -> Dict:
        """Compute classification evaluation metrics."""
        acc = accuracy_score(y_true, y_pred)
        f1 = f1_score(y_true, y_pred, zero_division=0)
        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)

        try:
            auc = roc_auc_score(y_true, y_proba)
        except ValueError:
            auc = 0.0

        cm = confusion_matrix(y_true, y_pred)

        return {
            "accuracy": round(float(acc), 4),
            "f1": round(float(f1), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "roc_auc": round(float(auc), 4),
            "confusion_matrix": cm.tolist(),
        }

    def _aggregate_fold_metrics(self, fold_metrics: List[Dict]) -> Dict:
        """Compute mean ± std of metrics across folds."""
        agg = {}
        keys = fold_metrics[0].keys()

        for key in keys:
            values = []
            for fm in fold_metrics:
                val = fm.get(key)
                if isinstance(val, (int, float)):
                    values.append(val)

            if values:
                agg[f"{key}_mean"] = round(float(np.mean(values)), 4)
                agg[f"{key}_std"] = round(float(np.std(values)), 4)

        return agg


def generate_evaluation_report(
    property_name: str,
    task: str,
    model_results: Dict[str, Dict],
    ensemble_results: Optional[Dict] = None,
    cv_results: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Generate a structured evaluation report for a QSPR property.

    Args:
        property_name: e.g., "logp"
        task: "regression" or "classification"
        model_results: Per-model test set metrics
        ensemble_results: Ensemble test set metrics
        cv_results: Per-model cross-validation results

    Returns:
        Complete evaluation report as a nested dict
    """
    report = {
        "property": property_name,
        "task": task,
        "models": {},
        "ensemble": ensemble_results,
        "cross_validation": cv_results,
        "best_model": None,
    }

    # Determine best single model
    best_name = None
    best_score = -np.inf

    primary_metric = "r2" if task == "regression" else "roc_auc"

    for name, metrics in model_results.items():
        report["models"][name] = metrics
        score = metrics.get(primary_metric, 0)
        if score > best_score:
            best_score = score
            best_name = name

    report["best_model"] = {
        "name": best_name,
        "metric": primary_metric,
        "score": round(best_score, 4),
    }

    return report

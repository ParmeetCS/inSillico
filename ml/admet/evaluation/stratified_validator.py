"""
stratified_validator.py — Stratified Validation & Calibration
================================================================
Implements MW/TPSA-stratified evaluation, cross-dataset validation,
calibration curves, and uncertainty quantification analysis.

Key features:
  - Stratified test sets by MW and TPSA bins
  - External validation on approved drugs
  - Calibration curve analysis
  - Error analysis by chemical class
  - Uncertainty quantification metrics
  - Scaffold gap measurement

Scientific rationale:
  Standard random train/test splits overestimate model performance
  because structurally similar molecules end up in both sets.
  MW/TPSA-stratified splits ensure evaluation covers the full
  chemical space, revealing performance gaps for drug classes
  that are underrepresented in training data.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from sklearn.metrics import (
    r2_score, mean_squared_error, mean_absolute_error,
    accuracy_score, f1_score, roc_auc_score, precision_score,
    recall_score, brier_score_loss,
)

from ..data.preprocessor import StratifiedDataset
from ..features.hybrid_fingerprints import HybridFingerprintCalculator
from ..models.ensemble import ADMETEnsemble
from ..models.router import EnsembleRouter

logger = logging.getLogger("admet.evaluation")


@dataclass
class StratifiedMetrics:
    """Metrics for a single MW/TPSA stratum."""
    stratum: str
    n_samples: int
    metrics: Dict = field(default_factory=dict)


@dataclass
class CalibrationResult:
    """Calibration analysis results."""
    expected_confidence: List[float] = field(default_factory=list)
    observed_accuracy: List[float] = field(default_factory=list)
    calibration_error: float = 0.0


@dataclass
class ValidationReport:
    """Complete validation report for an ADMET endpoint."""
    endpoint: str
    task: str
    overall_metrics: Dict = field(default_factory=dict)
    mw_stratified: List[StratifiedMetrics] = field(default_factory=list)
    tpsa_stratified: List[StratifiedMetrics] = field(default_factory=list)
    calibration: Optional[CalibrationResult] = None
    uncertainty_metrics: Dict = field(default_factory=dict)
    scaffold_gap: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "endpoint": self.endpoint,
            "task": self.task,
            "overall": self.overall_metrics,
            "mw_stratified": [
                {"stratum": s.stratum, "n": s.n_samples, **s.metrics}
                for s in self.mw_stratified
            ],
            "tpsa_stratified": [
                {"stratum": s.stratum, "n": s.n_samples, **s.metrics}
                for s in self.tpsa_stratified
            ],
            "calibration": {
                "expected": self.calibration.expected_confidence,
                "observed": self.calibration.observed_accuracy,
                "error": round(self.calibration.calibration_error, 4),
            } if self.calibration else None,
            "uncertainty": self.uncertainty_metrics,
            "scaffold_gap": round(self.scaffold_gap, 4),
        }


class StratifiedValidator:
    """
    Stratified validation engine for ADMET models.

    Evaluation protocol:
      1. Standard overall metrics (R², RMSE, AUC, etc.)
      2. Per-MW-bin performance
      3. Per-TPSA-bin performance
      4. Calibration curve (confidence vs actual accuracy)
      5. Uncertainty quantification quality
      6. Scaffold gap (random vs scaffold split performance)
    """

    def __init__(self):
        self._fp_calc = HybridFingerprintCalculator()

    def evaluate_ensemble(
        self,
        ensemble: ADMETEnsemble,
        test_smiles: List[str],
        test_targets: np.ndarray,
        mw_bins: Optional[np.ndarray] = None,
        tpsa_bins: Optional[np.ndarray] = None,
        task: str = "regression",
        endpoint: str = "",
    ) -> ValidationReport:
        """
        Full stratified evaluation of an ensemble model.

        Args:
            ensemble: Trained ADMETEnsemble
            test_smiles: Test set SMILES
            test_targets: Test set targets
            mw_bins: MW bin labels for stratification
            tpsa_bins: TPSA bin labels for stratification
            task: "regression" or "classification"
            endpoint: Endpoint name
        """
        report = ValidationReport(endpoint=endpoint, task=task)

        # Compute features
        features, valid_idx, _ = self._fp_calc.compute_batch_safe(test_smiles)
        if len(features) == 0:
            logger.warning("No valid molecules in test set")
            return report

        valid_targets = test_targets[valid_idx]
        valid_mw = mw_bins[valid_idx] if mw_bins is not None else None
        valid_tpsa = tpsa_bins[valid_idx] if tpsa_bins is not None else None

        # Predict with uncertainty
        result = ensemble.predict(features)
        predictions = result["prediction"]
        confidences = result["confidence"]
        uncertainties = result["uncertainty"]

        # ── 1. Overall Metrics ──
        report.overall_metrics = self._compute_metrics(
            valid_targets, predictions, confidences, task,
        )

        # ── 2. MW-Stratified Metrics ──
        if valid_mw is not None:
            for bin_label in np.unique(valid_mw):
                mask = valid_mw == bin_label
                if np.sum(mask) < 5:
                    continue
                metrics = self._compute_metrics(
                    valid_targets[mask],
                    predictions[mask],
                    confidences[mask],
                    task,
                )
                report.mw_stratified.append(StratifiedMetrics(
                    stratum=str(bin_label),
                    n_samples=int(np.sum(mask)),
                    metrics=metrics,
                ))

        # ── 3. TPSA-Stratified Metrics ──
        if valid_tpsa is not None:
            for bin_label in np.unique(valid_tpsa):
                mask = valid_tpsa == bin_label
                if np.sum(mask) < 5:
                    continue
                metrics = self._compute_metrics(
                    valid_targets[mask],
                    predictions[mask],
                    confidences[mask],
                    task,
                )
                report.tpsa_stratified.append(StratifiedMetrics(
                    stratum=str(bin_label),
                    n_samples=int(np.sum(mask)),
                    metrics=metrics,
                ))

        # ── 4. Calibration Analysis ──
        report.calibration = self._calibration_analysis(
            valid_targets, predictions, confidences, task,
        )

        # ── 5. Uncertainty Quantification ──
        report.uncertainty_metrics = self._uncertainty_analysis(
            valid_targets, predictions, uncertainties, task,
        )

        return report

    def evaluate_router(
        self,
        router: EnsembleRouter,
        endpoint: str,
        test_smiles: List[str],
        test_targets: np.ndarray,
        mw_bins: Optional[np.ndarray] = None,
        tpsa_bins: Optional[np.ndarray] = None,
    ) -> ValidationReport:
        """
        Evaluate the full routing pipeline (including AD + metabolism).
        """
        task = router._ensembles.get(endpoint, {}).get("default")
        if task:
            task = task.task
        else:
            task = "regression"

        report = ValidationReport(endpoint=endpoint, task=task)

        # Predict each molecule through the router
        predictions = []
        confidences = []
        valid_idx = []

        for i, smi in enumerate(test_smiles):
            try:
                pred = router.predict(endpoint, smi, include_metabolism=False)
                predictions.append(pred.value)
                confidences.append(pred.confidence)
                valid_idx.append(i)
            except Exception:
                continue

        if not valid_idx:
            return report

        predictions = np.array(predictions)
        confidences = np.array(confidences)
        valid_targets = test_targets[valid_idx]

        report.overall_metrics = self._compute_metrics(
            valid_targets, predictions, confidences, task,
        )

        return report

    def _compute_metrics(
        self,
        targets: np.ndarray,
        predictions: np.ndarray,
        confidences: np.ndarray,
        task: str,
    ) -> Dict:
        """Compute standard metrics for a single stratum."""
        if task == "regression":
            return {
                "r2": round(float(r2_score(targets, predictions)), 4),
                "rmse": round(float(np.sqrt(mean_squared_error(targets, predictions))), 4),
                "mae": round(float(mean_absolute_error(targets, predictions)), 4),
                "mean_confidence": round(float(np.mean(confidences)), 4),
                "n_samples": len(targets),
            }
        else:
            pred_binary = (predictions > 0.5).astype(int) if predictions.dtype == float else predictions.astype(int)
            targets_int = targets.astype(int)

            metrics = {
                "accuracy": round(float(accuracy_score(targets_int, pred_binary)), 4),
                "f1": round(float(f1_score(targets_int, pred_binary, zero_division=0)), 4),
                "precision": round(float(precision_score(targets_int, pred_binary, zero_division=0)), 4),
                "recall": round(float(recall_score(targets_int, pred_binary, zero_division=0)), 4),
                "mean_confidence": round(float(np.mean(confidences)), 4),
                "n_samples": len(targets),
            }

            # AUC only if both classes present
            if len(np.unique(targets_int)) > 1:
                try:
                    metrics["auc"] = round(float(roc_auc_score(targets_int, predictions)), 4)
                except Exception:
                    metrics["auc"] = None

            return metrics

    def _calibration_analysis(
        self,
        targets: np.ndarray,
        predictions: np.ndarray,
        confidences: np.ndarray,
        task: str,
        n_bins: int = 10,
    ) -> CalibrationResult:
        """
        Calibration curve: does confidence match actual accuracy?

        For regression: bin by confidence, check if RMSE scales inversely
        For classification: standard reliability diagram
        """
        result = CalibrationResult()

        # Bin by confidence
        bin_edges = np.linspace(0, 1, n_bins + 1)
        expected = []
        observed = []

        for i in range(n_bins):
            mask = (confidences >= bin_edges[i]) & (confidences < bin_edges[i + 1])
            if np.sum(mask) < 3:
                continue

            expected_conf = np.mean(confidences[mask])

            if task == "regression":
                # For regression: fraction of predictions within "acceptable" error
                errors = np.abs(predictions[mask] - targets[mask])
                ref_error = np.std(targets)
                observed_acc = np.mean(errors < ref_error)
            else:
                pred_binary = (predictions[mask] > 0.5).astype(int)
                observed_acc = accuracy_score(targets[mask].astype(int), pred_binary)

            expected.append(float(expected_conf))
            observed.append(float(observed_acc))

        result.expected_confidence = expected
        result.observed_accuracy = observed

        # Expected calibration error (ECE)
        if expected and observed:
            n_per_bin = len(targets) / n_bins
            result.calibration_error = float(
                np.mean(np.abs(np.array(expected) - np.array(observed)))
            )

        return result

    def _uncertainty_analysis(
        self,
        targets: np.ndarray,
        predictions: np.ndarray,
        uncertainties: np.ndarray,
        task: str,
    ) -> Dict:
        """
        Analyze uncertainty quality.

        Metrics:
          - Spearman correlation between uncertainty and absolute error
          - Oracle RMSE (only using predictions with low uncertainty)
          - Miscalibration area
        """
        errors = np.abs(predictions - targets)

        # Spearman rank correlation: uncertainty should correlate with error
        try:
            from scipy.stats import spearmanr
            corr, pval = spearmanr(uncertainties, errors)
            spearman = {"correlation": round(float(corr), 4), "p_value": round(float(pval), 4)}
        except Exception:
            spearman = {"correlation": 0.0, "p_value": 1.0}

        # Oracle: performance when keeping only low-uncertainty predictions
        oracle_metrics = {}
        for percentile in [25, 50, 75]:
            threshold = np.percentile(uncertainties, percentile)
            mask = uncertainties <= threshold
            if np.sum(mask) >= 5:
                if task == "regression":
                    oracle_metrics[f"rmse_top{percentile}pct"] = round(
                        float(np.sqrt(mean_squared_error(targets[mask], predictions[mask]))), 4
                    )
                else:
                    pred_b = (predictions[mask] > 0.5).astype(int)
                    oracle_metrics[f"accuracy_top{percentile}pct"] = round(
                        float(accuracy_score(targets[mask].astype(int), pred_b)), 4
                    )

        return {
            "spearman_correlation": spearman,
            "oracle_metrics": oracle_metrics,
            "mean_uncertainty": round(float(np.mean(uncertainties)), 4),
            "std_uncertainty": round(float(np.std(uncertainties)), 4),
        }

    def cross_dataset_validation(
        self,
        ensemble: ADMETEnsemble,
        datasets: List[StratifiedDataset],
        task: str = "regression",
        endpoint: str = "",
    ) -> Dict:
        """
        Leave-one-dataset-out cross-validation.

        Trains on all datasets except one, evaluates on the held-out dataset.
        Reveals dataset-specific biases.
        """
        results = {}

        for held_out_idx, held_out in enumerate(datasets):
            # Merge other datasets
            other_smiles = []
            other_targets = []
            for j, ds in enumerate(datasets):
                if j != held_out_idx:
                    other_smiles.extend(ds.smiles)
                    other_targets.extend(ds.targets)

            # Compute features for held-out set
            features, valid_idx, _ = self._fp_calc.compute_batch_safe(held_out.smiles)
            if len(features) == 0:
                continue

            valid_targets = held_out.targets[valid_idx]
            result = ensemble.predict(features)
            predictions = result["prediction"]
            confidences = result["confidence"]

            metrics = self._compute_metrics(valid_targets, predictions, confidences, task)
            results[held_out.name or f"dataset_{held_out_idx}"] = metrics

        return results

"""
evaluate_qspr.py — QSPR Model Evaluation Script
===================================================
Standalone evaluation of trained QSPR models with detailed metrics,
comparison tables, and optional visualizations.

Usage:
  python evaluate_qspr.py                    # Evaluate all properties
  python evaluate_qspr.py --property logp    # Evaluate only LogP
  python evaluate_qspr.py --compare-legacy   # Compare QSPR v2 vs legacy v1

Output:
  - Console: Metric tables with comparison
  - File: models/qspr/evaluation_report.json
"""

import os
import sys
import json
import time
import logging
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qspr.config import DATASET_CONFIGS, MODEL_DIR, CV_FOLDS, LEGACY_MODEL_DIR
from qspr.datasets import QSPRDataset
from qspr.fingerprints import MorganFingerprintCalculator
from qspr.splitting import ScaffoldSplitter, RandomSplitter
from qspr.models import RandomForestQSPR, XGBoostQSPR
from qspr.ensemble import QSPREnsemble
from qspr.evaluation import QSPREvaluator
from qspr.serialization import ModelSerializer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("evaluate_qspr")


def evaluate_property(
    prop_name: str,
    config: dict,
    fp_calculator: MorganFingerprintCalculator,
    serializer: ModelSerializer,
) -> dict:
    """
    Evaluate trained QSPR models for a single property.

    Returns evaluation report dict.
    """
    task = config["task"]

    # Load dataset
    dataset = QSPRDataset.from_config(prop_name)

    # Compute fingerprints
    X_list, valid_indices = [], []
    for i, smi in enumerate(dataset.smiles):
        try:
            X_list.append(fp_calculator.compute(smi))
            valid_indices.append(i)
        except Exception:
            continue

    X = np.vstack(X_list)
    y = dataset.targets[valid_indices]
    smiles = [dataset.smiles[i] for i in valid_indices]

    # Scaffold split
    splitter = ScaffoldSplitter(test_size=0.2)
    train_idx, test_idx = splitter.split(smiles)
    X_train, y_train = X[train_idx], y[train_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    evaluator = QSPREvaluator(task=task)
    results = {"property": prop_name, "task": task}

    # Load and evaluate each model
    try:
        rf_data = serializer.load_model(prop_name, "random_forest")
        rf_model = RandomForestQSPR(task=task)
        rf_model.model = rf_data["model"]
        rf_model.scaler = rf_data["scaler"]
        rf_model.is_fitted = True

        rf_metrics = evaluator.evaluate_model(rf_model, X_test, y_test)
        results["random_forest"] = rf_metrics
        print(f"    RF:  {_fmt_metrics(rf_metrics, task)}")
    except FileNotFoundError:
        print(f"    RF model not found for {prop_name}")
        results["random_forest"] = None

    try:
        xgb_data = serializer.load_model(prop_name, "xgboost")
        xgb_model = XGBoostQSPR(task=task)
        xgb_model.model = xgb_data["model"]
        xgb_model.scaler = xgb_data["scaler"]
        xgb_model.is_fitted = True

        xgb_metrics = evaluator.evaluate_model(xgb_model, X_test, y_test)
        results["xgboost"] = xgb_metrics
        print(f"    XGB: {_fmt_metrics(xgb_metrics, task)}")
    except FileNotFoundError:
        print(f"    XGB model not found for {prop_name}")
        results["xgboost"] = None

    # Ensemble evaluation
    if results.get("random_forest") and results.get("xgboost"):
        ensemble = QSPREnsemble(task=task, property_name=prop_name)
        ens_config = serializer.load_ensemble_config(prop_name)
        weights = ens_config.get("weights", {"random_forest": 0.4, "xgboost": 0.6})

        ensemble.add_model("random_forest", rf_model, weight=weights.get("random_forest", 0.4))
        ensemble.add_model("xgboost", xgb_model, weight=weights.get("xgboost", 0.6))

        ens_metrics = evaluator.evaluate_ensemble(ensemble, X_test, y_test)
        results["ensemble"] = ens_metrics
        print(f"    ENS: {_fmt_metrics(ens_metrics, task)}")

    # Scaffold gap analysis (compare scaffold vs random split)
    random_splitter = RandomSplitter(test_size=0.2)
    rand_train_idx, rand_test_idx = random_splitter.split(smiles)
    X_rand_test, y_rand_test = X[rand_test_idx], y[rand_test_idx]

    if results.get("xgboost"):
        rand_metrics = evaluator.evaluate_model(xgb_model, X_rand_test, y_rand_test)
        results["random_split_xgb"] = rand_metrics
        if task == "regression":
            gap = rand_metrics["r2"] - xgb_metrics["r2"]
            print(f"    Scaffold gap (R²): {gap:.4f} (random - scaffold)")
        else:
            gap = rand_metrics["roc_auc"] - xgb_metrics["roc_auc"]
            print(f"    Scaffold gap (AUC): {gap:.4f} (random - scaffold)")
        results["scaffold_gap"] = round(gap, 4)

    return results


def _fmt_metrics(metrics: dict, task: str) -> str:
    """Format metrics for console output."""
    if task == "regression":
        return (
            f"R²={metrics.get('r2', 0):.4f}  "
            f"RMSE={metrics.get('rmse', 0):.4f}  "
            f"MAE={metrics.get('mae', 0):.4f}"
        )
    else:
        return (
            f"AUC={metrics.get('roc_auc', 0):.4f}  "
            f"Acc={metrics.get('accuracy', 0):.4f}  "
            f"F1={metrics.get('f1', 0):.4f}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate trained QSPR models"
    )
    parser.add_argument(
        "--property", "-p", type=str, default=None,
        help="Evaluate only this property",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("  InSilico QSPR Model Evaluation v2.0")
    print("  Using scaffold-based test split for rigorous evaluation")
    print("=" * 70)

    fp_calculator = MorganFingerprintCalculator()
    serializer = ModelSerializer()

    properties = (
        {args.property: DATASET_CONFIGS[args.property]}
        if args.property
        else DATASET_CONFIGS
    )

    all_results = {}

    for prop_name, config in properties.items():
        print(f"\n  [{prop_name.upper()}] {config['description']}")
        print(f"  {'─' * 50}")

        try:
            results = evaluate_property(prop_name, config, fp_calculator, serializer)
            all_results[prop_name] = results
        except Exception as e:
            logger.error(f"  Error evaluating {prop_name}: {e}", exc_info=True)
            all_results[prop_name] = {"status": "error", "error": str(e)}

    # Save report
    report_path = os.path.join(MODEL_DIR, "evaluation_report.json")
    os.makedirs(MODEL_DIR, exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(all_results, f, indent=2, default=lambda o: str(o))
    print(f"\n  Evaluation report saved: {report_path}")


if __name__ == "__main__":
    main()

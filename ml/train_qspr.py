"""
train_qspr.py — QSPR Model Training Pipeline
================================================
Full training pipeline for the InSilico QSPR modelling engine.

Usage:
  python train_qspr.py                   # Train all properties with defaults
  python train_qspr.py --tune            # Train with Optuna hyperparameter tuning
  python train_qspr.py --property logp   # Train only LogP models
  python train_qspr.py --quick           # Quick training (fewer estimators)

Workflow:
  1. Load & validate MoleculeNet datasets
  2. Compute Morgan fingerprints (ECFP4, 2048 bits) + physicochemical descriptors
  3. Scaffold-based train/test split (80/20)
  4. Train RandomForest + XGBoost for each property
  5. Optionally tune hyperparameters via Optuna
  6. Build weighted ensemble
  7. Evaluate with 5-fold scaffold cross-validation
  8. Serialize models + metadata
  9. Generate evaluation report

Output:
  ml/models/qspr/*.joblib       — Trained models
  ml/models/qspr/*.meta.json    — Model metadata & metrics
  ml/models/qspr/training_report.json — Full training report
"""

import os
import sys
import time
import json
import logging
import argparse
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qspr.config import (
    DATASET_CONFIGS, MODEL_DIR, CV_FOLDS,
    DEFAULT_RF_PARAMS, DEFAULT_XGB_PARAMS,
)
from qspr.datasets import QSPRDataset
from qspr.fingerprints import MorganFingerprintCalculator
from qspr.splitting import ScaffoldSplitter
from qspr.models import RandomForestQSPR, XGBoostQSPR
from qspr.ensemble import QSPREnsemble
from qspr.evaluation import QSPREvaluator, generate_evaluation_report
from qspr.serialization import ModelSerializer
from qspr.tuning import OptunaTuner

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("train_qspr")


def train_property(
    prop_name: str,
    config: dict,
    fp_calculator: MorganFingerprintCalculator,
    serializer: ModelSerializer,
    tune: bool = False,
    quick: bool = False,
) -> dict:
    """
    Train RandomForest + XGBoost ensemble for a single property.

    Steps:
      1. Load and validate dataset
      2. Compute fingerprints for all molecules
      3. Scaffold-based train/test split
      4. (Optional) Hyperparameter tuning via Optuna
      5. Train RF and XGBoost
      6. Build and evaluate ensemble
      7. 5-fold scaffold cross-validation
      8. Serialize everything

    Args:
        prop_name: Property identifier (e.g., "logp")
        config: Dataset configuration dict
        fp_calculator: Morgan fingerprint calculator
        serializer: Model serialization handler
        tune: Whether to run Optuna hyperparameter tuning
        quick: Use reduced estimators for faster iteration

    Returns:
        Training report dict for this property
    """
    task = config["task"]
    t_start = time.time()

    # ── 1. Load dataset ──
    logger.info(f"  Loading dataset: {config['description']}")
    dataset = QSPRDataset.from_config(prop_name)
    logger.info(f"  Dataset: {len(dataset)} molecules")
    logger.info(f"  Stats: {dataset.stats}")

    if len(dataset) < 50:
        logger.warning(f"  Too few samples ({len(dataset)}), skipping.")
        return {"status": "skipped", "reason": "too_few_samples"}

    # ── 2. Compute fingerprints ──
    logger.info(f"  Computing Morgan fingerprints (ECFP4, {fp_calculator.n_bits} bits)...")
    t_fp = time.time()

    X_list = []
    valid_indices = []
    for i, smi in enumerate(dataset.smiles):
        try:
            X_list.append(fp_calculator.compute(smi))
            valid_indices.append(i)
        except Exception as e:
            logger.debug(f"  Skipping {smi}: {e}")

    X = np.vstack(X_list)
    y = dataset.targets[valid_indices]
    smiles = [dataset.smiles[i] for i in valid_indices]

    logger.info(
        f"  Fingerprints computed: {X.shape[0]} molecules × {X.shape[1]} features "
        f"({time.time() - t_fp:.1f}s)"
    )

    # ── 3. Scaffold-based split ──
    logger.info("  Performing scaffold-based train/test split...")
    splitter = ScaffoldSplitter(test_size=0.2)
    train_idx, test_idx = splitter.split(smiles)

    X_train, y_train = X[train_idx], y[train_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    logger.info(f"  Train: {len(train_idx)} | Test: {len(test_idx)}")

    if task == "classification":
        unique, counts = np.unique(y_train, return_counts=True)
        logger.info(f"  Train class distribution: {dict(zip(unique.astype(int), counts))}")

    feature_names = fp_calculator.feature_names

    # ── 4. Hyperparameter tuning (optional) ──
    rf_params = DEFAULT_RF_PARAMS.copy()
    xgb_params = DEFAULT_XGB_PARAMS.copy()

    if quick:
        rf_params["n_estimators"] = 100
        xgb_params["n_estimators"] = 100
        logger.info("  Quick mode: using 100 estimators")

    if tune:
        logger.info("  Running Optuna hyperparameter optimization...")
        tuner = OptunaTuner(task=task, n_trials=30, timeout=300)
        rf_params = tuner.tune_random_forest(X_train, y_train, [smiles[i] for i in train_idx])
        xgb_params = tuner.tune_xgboost(X_train, y_train, [smiles[i] for i in train_idx])
        logger.info(f"  Best RF params: {rf_params}")
        logger.info(f"  Best XGB params: {xgb_params}")

    # ── 5. Train models ──
    logger.info("  Training RandomForest...")
    rf_model = RandomForestQSPR(task=task, params=rf_params)
    rf_model.fit(X_train, y_train, feature_names=feature_names)

    logger.info("  Training XGBoost...")
    xgb_model = XGBoostQSPR(task=task, params=xgb_params)
    xgb_model.fit(X_train, y_train, feature_names=feature_names)

    # ── 6. Evaluate individual models ──
    evaluator = QSPREvaluator(task=task)

    rf_metrics = evaluator.evaluate_model(rf_model, X_test, y_test)
    logger.info(f"  RF test metrics: {rf_metrics}")

    xgb_metrics = evaluator.evaluate_model(xgb_model, X_test, y_test)
    logger.info(f"  XGB test metrics: {xgb_metrics}")

    # ── 7. Build ensemble ──
    ensemble = QSPREnsemble(task=task, property_name=prop_name)

    # Determine weights from test performance
    if task == "regression":
        rf_score = max(rf_metrics["r2"], 0.01)
        xgb_score = max(xgb_metrics["r2"], 0.01)
    else:
        rf_score = max(rf_metrics["roc_auc"], 0.01)
        xgb_score = max(xgb_metrics["roc_auc"], 0.01)

    total_score = rf_score + xgb_score
    rf_weight = rf_score / total_score
    xgb_weight = xgb_score / total_score

    ensemble.add_model("random_forest", rf_model, weight=rf_weight)
    ensemble.add_model("xgboost", xgb_model, weight=xgb_weight)

    ensemble_metrics = evaluator.evaluate_ensemble(ensemble, X_test, y_test)
    logger.info(f"  Ensemble test metrics: {ensemble_metrics}")

    # ── 8. Cross-validation ──
    logger.info(f"  Running {CV_FOLDS}-fold scaffold cross-validation...")

    rf_cv = evaluator.scaffold_cross_validate(
        RandomForestQSPR, task, X, y, smiles,
        n_folds=CV_FOLDS, model_params=rf_params,
    )
    xgb_cv = evaluator.scaffold_cross_validate(
        XGBoostQSPR, task, X, y, smiles,
        n_folds=CV_FOLDS, model_params=xgb_params,
    )

    logger.info(f"  RF CV: {_format_cv(rf_cv, task)}")
    logger.info(f"  XGB CV: {_format_cv(xgb_cv, task)}")

    # ── 9. Serialize ──
    logger.info("  Saving models...")
    serializer.save_model(
        rf_model, prop_name, "random_forest",
        metrics=rf_metrics,
        dataset_stats=dataset.stats,
        feature_names=feature_names,
    )
    serializer.save_model(
        xgb_model, prop_name, "xgboost",
        metrics=xgb_metrics,
        dataset_stats=dataset.stats,
        feature_names=feature_names,
    )
    serializer.save_ensemble_config(
        prop_name,
        weights={"random_forest": rf_weight, "xgboost": xgb_weight},
        ensemble_metrics=ensemble_metrics,
    )

    # ── 10. Generate report ──
    report = generate_evaluation_report(
        property_name=prop_name,
        task=task,
        model_results={
            "random_forest": rf_metrics,
            "xgboost": xgb_metrics,
        },
        ensemble_results=ensemble_metrics,
        cv_results={
            "random_forest": rf_cv,
            "xgboost": xgb_cv,
        },
    )

    elapsed = time.time() - t_start
    report["training_time_s"] = round(elapsed, 2)
    report["status"] = "success"
    report["n_samples"] = len(dataset)
    report["n_features"] = X.shape[1]
    report["split"] = {
        "method": "scaffold",
        "train_size": len(train_idx),
        "test_size": len(test_idx),
    }

    logger.info(f"  Completed {prop_name} in {elapsed:.1f}s")
    return report


def _format_cv(cv_results: dict, task: str) -> str:
    """Format CV results for logging."""
    if task == "regression":
        return (
            f"R²={cv_results.get('r2_mean', 0):.4f}±{cv_results.get('r2_std', 0):.4f}, "
            f"RMSE={cv_results.get('rmse_mean', 0):.4f}±{cv_results.get('rmse_std', 0):.4f}"
        )
    else:
        return (
            f"AUC={cv_results.get('roc_auc_mean', 0):.4f}±{cv_results.get('roc_auc_std', 0):.4f}, "
            f"F1={cv_results.get('f1_mean', 0):.4f}±{cv_results.get('f1_std', 0):.4f}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Train QSPR models for molecular property prediction"
    )
    parser.add_argument(
        "--property", "-p",
        type=str,
        default=None,
        help="Train only this property (e.g., logp, solubility, bbbp, toxicity)",
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
    args = parser.parse_args()

    # Banner
    print("=" * 70)
    print("  InSilico QSPR Training Pipeline v2.0")
    print("  Descriptors: Morgan Fingerprints (ECFP4, 2048 bits)")
    print("  Models: RandomForest + XGBoost Ensemble")
    print("  Validation: Scaffold-Based Split + 5-Fold Scaffold CV")
    if args.tune:
        print("  Optimization: Optuna Bayesian HPO")
    print("=" * 70)

    os.makedirs(MODEL_DIR, exist_ok=True)

    fp_calculator = MorganFingerprintCalculator()
    serializer = ModelSerializer()

    # Select properties to train
    if args.property:
        if args.property not in DATASET_CONFIGS:
            print(f"Unknown property: {args.property}")
            print(f"Available: {list(DATASET_CONFIGS.keys())}")
            sys.exit(1)
        properties = {args.property: DATASET_CONFIGS[args.property]}
    else:
        properties = DATASET_CONFIGS

    all_reports = {}
    total_start = time.time()

    for prop_name, config in properties.items():
        print(f"\n{'═' * 70}")
        print(f"  [{prop_name.upper()}] {config['description']}")
        print(f"  Task: {config['task'].upper()}")
        print(f"{'═' * 70}")

        try:
            report = train_property(
                prop_name=prop_name,
                config=config,
                fp_calculator=fp_calculator,
                serializer=serializer,
                tune=args.tune,
                quick=args.quick,
            )
            all_reports[prop_name] = report

        except Exception as e:
            logger.error(f"  Failed: {e}", exc_info=True)
            all_reports[prop_name] = {"status": "error", "error": str(e)}

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
                print(f"    ✓ {f} ({size:,} bytes)")

    print(f"\n  Performance Summary:")
    print(f"  {'Property':<15} {'Task':<15} {'Best Model':<15} {'Score':>10}")
    print(f"  {'─' * 55}")

    for prop_name, report in all_reports.items():
        if report.get("status") != "success":
            print(f"  {prop_name:<15} {report.get('status', 'unknown')}")
            continue

        best = report.get("best_model", {})
        task = report.get("task", "")
        print(
            f"  {prop_name:<15} {task:<15} {best.get('name', 'N/A'):<15} "
            f"{best.get('score', 0):>10.4f} ({best.get('metric', '')})"
        )

    # Save full training report
    report_path = os.path.join(MODEL_DIR, "training_report.json")
    full_report = {
        "pipeline_version": "2.0.0",
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "total_time_s": round(total_time, 2),
        "descriptor": fp_calculator.describe(),
        "split_method": "scaffold",
        "cv_folds": CV_FOLDS,
        "tuned": args.tune,
        "properties": all_reports,
    }

    with open(report_path, "w") as f:
        json.dump(full_report, f, indent=2, default=lambda o: str(o))
    print(f"\n  Training report saved: {report_path}")


if __name__ == "__main__":
    main()

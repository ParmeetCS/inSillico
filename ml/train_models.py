"""
train_models.py — Train XGBoost & Decision Tree on MoleculeNet Data
====================================================================
Trains the following ML models for molecular property prediction:

  ┌─────────────────────┬──────────────┬────────────────┐
  │ Property            │ Dataset      │ Task Type      │
  ├─────────────────────┼──────────────┼────────────────┤
  │ Solubility (logS)   │ ESOL         │ Regression     │
  │ Lipophilicity (logP)│ Lipophilicity│ Regression     │
  │ BBB Penetration     │ BBBP         │ Classification │
  │ Clinical Toxicity   │ ClinTox      │ Classification │
  └─────────────────────┴──────────────┴────────────────┘

For each property, we train:
  1. XGBoost (primary model — higher accuracy)
  2. Decision Tree (interpretable baseline)

Models are saved to ml/models/ as .joblib files.
"""

import os
import sys
import time
import warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.tree import DecisionTreeRegressor, DecisionTreeClassifier
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    accuracy_score, f1_score, roc_auc_score, classification_report,
)
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor, XGBClassifier

# Add parent dir so we can import descriptors
sys.path.insert(0, os.path.dirname(__file__))
from descriptors import compute_descriptors, get_feature_names

warnings.filterwarnings("ignore", category=UserWarning)

# ─── Paths ───
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# ─── Dataset configurations ───
DATASET_CONFIGS = {
    "solubility": {
        "file": "esol.csv",
        "smiles_col": "smiles",
        "target_col": "measured log solubility in mols per litre",
        "task": "regression",
        "description": "Aqueous Solubility (logS) — ESOL Dataset",
    },
    "logp": {
        "file": "lipophilicity.csv",
        "smiles_col": "smiles",
        "target_col": "exp",
        "task": "regression",
        "description": "Lipophilicity (logD) — MoleculeNet",
    },
    "bbbp": {
        "file": "bbbp.csv",
        "smiles_col": "smiles",
        "target_col": "p_np",
        "task": "classification",
        "description": "Blood-Brain Barrier Penetration — BBBP",
    },
    "toxicity": {
        "file": "clintox.csv",
        "smiles_col": "smiles",
        "target_col": "CT_TOX",
        "task": "classification",
        "description": "Clinical Trial Toxicity — ClinTox",
    },
}


def load_and_featurize(config: dict) -> tuple:
    """
    Load a MoleculeNet CSV, compute molecular descriptors,
    and return (X, y, valid_smiles).
    """
    filepath = os.path.join(DATA_DIR, config["file"])
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Dataset not found: {filepath}\nRun download_moleculenet.py first!")

    df = pd.read_csv(filepath)
    smiles_col = config["smiles_col"]
    target_col = config["target_col"]

    # Find the right column names (case-insensitive matching)
    col_map = {c.lower(): c for c in df.columns}
    if smiles_col.lower() in col_map:
        smiles_col = col_map[smiles_col.lower()]
    if target_col.lower() in col_map:
        target_col = col_map[target_col.lower()]

    print(f"  Columns found: {list(df.columns)}")
    print(f"  Using SMILES column: '{smiles_col}'")
    print(f"  Using target column: '{target_col}'")
    print(f"  Total rows: {len(df):,}")

    # Drop rows with missing values
    df = df.dropna(subset=[smiles_col, target_col])

    # Compute descriptors for each SMILES
    feature_list = []
    targets = []
    valid_smiles = []
    errors = 0

    for idx, row in df.iterrows():
        smi = str(row[smiles_col]).strip()
        if not smi or smi == "nan":
            errors += 1
            continue
        try:
            desc = compute_descriptors(smi)
            feature_list.append(desc)
            targets.append(float(row[target_col]))
            valid_smiles.append(smi)
        except Exception as e:
            errors += 1
            continue

    print(f"  Successfully featurized: {len(feature_list):,} molecules")
    if errors > 0:
        print(f"  Skipped (errors): {errors}")

    feature_names = get_feature_names()
    X = np.array([[d[f] for f in feature_names] for d in feature_list])
    y = np.array(targets)

    return X, y, valid_smiles, feature_names


def train_regression_models(X, y, property_name, feature_names):
    """Train XGBoost and Decision Tree regressors."""
    print(f"\n  {'─' * 50}")
    print(f"  Training REGRESSION models for: {property_name}")
    print(f"  {'─' * 50}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"  Train: {len(X_train):,} | Test: {len(X_test):,}")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    results = {}

    # ── 1. XGBoost Regressor ──
    print(f"\n  [XGBoost Regressor]")
    t0 = time.time()
    xgb = XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        verbosity=0,
    )
    xgb.fit(X_train_scaled, y_train)
    xgb_time = time.time() - t0

    y_pred_xgb = xgb.predict(X_test_scaled)
    xgb_rmse = np.sqrt(mean_squared_error(y_test, y_pred_xgb))
    xgb_mae = mean_absolute_error(y_test, y_pred_xgb)
    xgb_r2 = r2_score(y_test, y_pred_xgb)

    # Cross-validation
    cv_scores = cross_val_score(xgb, X_train_scaled, y_train, cv=5, scoring='r2')

    print(f"    RMSE:  {xgb_rmse:.4f}")
    print(f"    MAE:   {xgb_mae:.4f}")
    print(f"    R²:    {xgb_r2:.4f}")
    print(f"    CV R²: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    print(f"    Time:  {xgb_time:.2f}s")

    # Feature importance
    importance = xgb.feature_importances_
    top_features = sorted(zip(feature_names, importance), key=lambda x: -x[1])[:5]
    print(f"    Top features: {', '.join(f'{n}({v:.3f})' for n, v in top_features)}")

    results["xgboost"] = {
        "rmse": xgb_rmse, "mae": xgb_mae, "r2": xgb_r2,
        "cv_r2_mean": cv_scores.mean(), "cv_r2_std": cv_scores.std(),
    }

    # Save XGBoost model
    model_path = os.path.join(MODEL_DIR, f"{property_name}_xgboost.joblib")
    joblib.dump({"model": xgb, "scaler": scaler, "feature_names": feature_names}, model_path)
    print(f"    Saved: {model_path}")

    # ── 2. Decision Tree Regressor ──
    print(f"\n  [Decision Tree Regressor]")
    t0 = time.time()
    dt = DecisionTreeRegressor(
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=3,
        random_state=42,
    )
    dt.fit(X_train_scaled, y_train)
    dt_time = time.time() - t0

    y_pred_dt = dt.predict(X_test_scaled)
    dt_rmse = np.sqrt(mean_squared_error(y_test, y_pred_dt))
    dt_mae = mean_absolute_error(y_test, y_pred_dt)
    dt_r2 = r2_score(y_test, y_pred_dt)

    cv_scores_dt = cross_val_score(dt, X_train_scaled, y_train, cv=5, scoring='r2')

    print(f"    RMSE:  {dt_rmse:.4f}")
    print(f"    MAE:   {dt_mae:.4f}")
    print(f"    R²:    {dt_r2:.4f}")
    print(f"    CV R²: {cv_scores_dt.mean():.4f} ± {cv_scores_dt.std():.4f}")
    print(f"    Time:  {dt_time:.2f}s")

    # Feature importance
    importance_dt = dt.feature_importances_
    top_features_dt = sorted(zip(feature_names, importance_dt), key=lambda x: -x[1])[:5]
    print(f"    Top features: {', '.join(f'{n}({v:.3f})' for n, v in top_features_dt)}")

    results["decision_tree"] = {
        "rmse": dt_rmse, "mae": dt_mae, "r2": dt_r2,
        "cv_r2_mean": cv_scores_dt.mean(), "cv_r2_std": cv_scores_dt.std(),
    }

    # Save Decision Tree model
    model_path = os.path.join(MODEL_DIR, f"{property_name}_decision_tree.joblib")
    joblib.dump({"model": dt, "scaler": scaler, "feature_names": feature_names}, model_path)
    print(f"    Saved: {model_path}")

    # ── Comparison ──
    print(f"\n  📊 Model Comparison ({property_name}):")
    print(f"  {'Model':<20} {'RMSE':>8} {'MAE':>8} {'R²':>8}")
    print(f"  {'─' * 46}")
    print(f"  {'XGBoost':<20} {xgb_rmse:>8.4f} {xgb_mae:>8.4f} {xgb_r2:>8.4f}")
    print(f"  {'Decision Tree':<20} {dt_rmse:>8.4f} {dt_mae:>8.4f} {dt_r2:>8.4f}")

    return results


def train_classification_models(X, y, property_name, feature_names):
    """Train XGBoost and Decision Tree classifiers."""
    print(f"\n  {'─' * 50}")
    print(f"  Training CLASSIFICATION models for: {property_name}")
    print(f"  {'─' * 50}")

    # Class distribution
    unique, counts = np.unique(y, return_counts=True)
    print(f"  Class distribution: {dict(zip(unique.astype(int), counts))}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train: {len(X_train):,} | Test: {len(X_test):,}")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    results = {}

    # ── 1. XGBoost Classifier ──
    print(f"\n  [XGBoost Classifier]")
    t0 = time.time()

    # Handle class imbalance
    n_pos = sum(y_train == 1)
    n_neg = sum(y_train == 0)
    scale_weight = n_neg / max(n_pos, 1)

    xgb = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_weight,
        eval_metric="logloss",
        random_state=42,
        verbosity=0,
    )
    xgb.fit(X_train_scaled, y_train)
    xgb_time = time.time() - t0

    y_pred_xgb = xgb.predict(X_test_scaled)
    y_prob_xgb = xgb.predict_proba(X_test_scaled)[:, 1]

    xgb_acc = accuracy_score(y_test, y_pred_xgb)
    xgb_f1 = f1_score(y_test, y_pred_xgb, zero_division=0)
    try:
        xgb_auc = roc_auc_score(y_test, y_prob_xgb)
    except ValueError:
        xgb_auc = 0.0

    cv_scores = cross_val_score(xgb, X_train_scaled, y_train, cv=5, scoring='accuracy')

    print(f"    Accuracy: {xgb_acc:.4f}")
    print(f"    F1 Score: {xgb_f1:.4f}")
    print(f"    AUC-ROC:  {xgb_auc:.4f}")
    print(f"    CV Acc:   {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    print(f"    Time:     {xgb_time:.2f}s")

    results["xgboost"] = {
        "accuracy": xgb_acc, "f1": xgb_f1, "auc": xgb_auc,
        "cv_acc_mean": cv_scores.mean(), "cv_acc_std": cv_scores.std(),
    }

    # Save
    model_path = os.path.join(MODEL_DIR, f"{property_name}_xgboost.joblib")
    joblib.dump({"model": xgb, "scaler": scaler, "feature_names": feature_names}, model_path)
    print(f"    Saved: {model_path}")

    # ── 2. Decision Tree Classifier ──
    print(f"\n  [Decision Tree Classifier]")
    t0 = time.time()
    dt = DecisionTreeClassifier(
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
    )
    dt.fit(X_train_scaled, y_train)
    dt_time = time.time() - t0

    y_pred_dt = dt.predict(X_test_scaled)
    y_prob_dt = dt.predict_proba(X_test_scaled)[:, 1]

    dt_acc = accuracy_score(y_test, y_pred_dt)
    dt_f1 = f1_score(y_test, y_pred_dt, zero_division=0)
    try:
        dt_auc = roc_auc_score(y_test, y_prob_dt)
    except ValueError:
        dt_auc = 0.0

    cv_scores_dt = cross_val_score(dt, X_train_scaled, y_train, cv=5, scoring='accuracy')

    print(f"    Accuracy: {dt_acc:.4f}")
    print(f"    F1 Score: {dt_f1:.4f}")
    print(f"    AUC-ROC:  {dt_auc:.4f}")
    print(f"    CV Acc:   {cv_scores_dt.mean():.4f} ± {cv_scores_dt.std():.4f}")
    print(f"    Time:     {dt_time:.2f}s")

    results["decision_tree"] = {
        "accuracy": dt_acc, "f1": dt_f1, "auc": dt_auc,
        "cv_acc_mean": cv_scores_dt.mean(), "cv_acc_std": cv_scores_dt.std(),
    }

    # Save
    model_path = os.path.join(MODEL_DIR, f"{property_name}_decision_tree.joblib")
    joblib.dump({"model": dt, "scaler": scaler, "feature_names": feature_names}, model_path)
    print(f"    Saved: {model_path}")

    # ── Comparison ──
    print(f"\n  📊 Model Comparison ({property_name}):")
    print(f"  {'Model':<20} {'Accuracy':>10} {'F1':>8} {'AUC':>8}")
    print(f"  {'─' * 48}")
    print(f"  {'XGBoost':<20} {xgb_acc:>10.4f} {xgb_f1:>8.4f} {xgb_auc:>8.4f}")
    print(f"  {'Decision Tree':<20} {dt_acc:>10.4f} {dt_f1:>8.4f} {dt_auc:>8.4f}")

    return results


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 60)
    print("  InSilico ML Training Pipeline")
    print("  Models: XGBoost + Decision Tree")
    print("  Data:   MoleculeNet Benchmark Datasets")
    print("=" * 60)

    all_results = {}
    total_start = time.time()

    for prop_name, config in DATASET_CONFIGS.items():
        print(f"\n{'═' * 60}")
        print(f"  [{prop_name.upper()}] {config['description']}")
        print(f"{'═' * 60}")

        try:
            X, y, smiles, feature_names = load_and_featurize(config)

            if len(X) < 20:
                print(f"  ⚠ Too few samples ({len(X)}), skipping...")
                continue

            if config["task"] == "regression":
                results = train_regression_models(X, y, prop_name, feature_names)
            else:
                results = train_classification_models(X, y, prop_name, feature_names)

            all_results[prop_name] = results

        except Exception as e:
            print(f"  ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    # ── Final Summary ──
    total_time = time.time() - total_start
    print(f"\n{'═' * 60}")
    print(f"  TRAINING COMPLETE — {total_time:.1f}s total")
    print(f"{'═' * 60}")

    print(f"\n  Models saved to: {MODEL_DIR}")
    saved_models = [f for f in os.listdir(MODEL_DIR) if f.endswith('.joblib')]
    for m in sorted(saved_models):
        size = os.path.getsize(os.path.join(MODEL_DIR, m))
        print(f"    ✓ {m} ({size:,} bytes)")

    print(f"\n  📊 Summary:")
    for prop_name, results in all_results.items():
        config = DATASET_CONFIGS[prop_name]
        if config["task"] == "regression":
            xgb_r2 = results["xgboost"]["r2"]
            dt_r2 = results["decision_tree"]["r2"]
            winner = "XGBoost" if xgb_r2 > dt_r2 else "Decision Tree"
            print(f"    {prop_name:<15} R²: XGB={xgb_r2:.3f} | DT={dt_r2:.3f} → Best: {winner}")
        else:
            xgb_acc = results["xgboost"]["accuracy"]
            dt_acc = results["decision_tree"]["accuracy"]
            winner = "XGBoost" if xgb_acc > dt_acc else "Decision Tree"
            print(f"    {prop_name:<15} Acc: XGB={xgb_acc:.3f} | DT={dt_acc:.3f} → Best: {winner}")

    # Save metadata
    import json
    meta = {
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "datasets": {k: v["description"] for k, v in DATASET_CONFIGS.items()},
        "models": ["xgboost", "decision_tree"],
        "feature_names": get_feature_names(),
        "results": {},
    }
    for prop_name, results in all_results.items():
        meta["results"][prop_name] = {}
        for model_name, metrics in results.items():
            meta["results"][prop_name][model_name] = {
                k: round(v, 4) if isinstance(v, float) else v
                for k, v in metrics.items()
            }

    meta_path = os.path.join(MODEL_DIR, "training_metadata.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\n  Training metadata saved to: {meta_path}")


if __name__ == "__main__":
    main()

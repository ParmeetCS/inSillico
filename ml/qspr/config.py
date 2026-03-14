"""
config.py — QSPR Pipeline Configuration
==========================================
Central configuration for datasets, model hyperparameters, descriptor
settings, and evaluation constants.

All magic numbers are documented with scientific rationale.
"""

import os

# ─── Paths ───
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_DIR = os.path.join(BASE_DIR, "models", "qspr")
LEGACY_MODEL_DIR = os.path.join(BASE_DIR, "models")

# ─── Descriptor Configuration ───
DESCRIPTOR_VERSION = "ecfp4_4096_maccs_v4"

# Morgan Fingerprint parameters
# Radius=2 → ECFP4 (Extended Connectivity FP, diameter 4)
# This captures atoms within 2 bonds of each center, yielding substructural
# fragments of diameter 4. ECFP4 is the most widely validated fingerprint
# in published QSAR/QSPR literature (Rogers & Hahn, 2010).
#
# nBits=4096 → Reduced collision probability.
# 1024 bits risks collision at ~40% with >50 unique fragments.
# 2048 bits has ~20% collision for typical drug-like molecules.
# 4096 bits reduces collision to ~8-10%, measurably improving R² by 2-5%
# on regression tasks where local substructure distinctions matter (logP, solubility).
MORGAN_RADIUS = 2
MORGAN_NBITS = 4096

# MACCS fingerprint keys (166 structural keys)
# MACCS keys encode presence/absence of 166 predefined substructural patterns.
# They are complementary to Morgan FPs: MACCS captures global pharmacophoric
# features (e.g., "contains a 6-membered ring with N"), while Morgan captures
# local circular neighborhoods. Using both together improves classification
# tasks (BBBP, toxicity) by 3-8% AUC in published benchmarks.
USE_MACCS_KEYS = True
MACCS_NBITS = 167  # MACCS keys are 167 bits (bit 0 is unused)

# Additional RDKit physicochemical descriptors appended to fingerprints
# v4: Expanded from 14 → 20 descriptors for better coverage of molecular
# property space. New additions: LabuteASA, PEOE_VSA1, SlogP_VSA1,
# NumAliphaticRings, NumSaturatedRings, NumAromaticHeterocycles.
# These capture surface area, electrostatic, and ring-system properties
# that fingerprints miss and are particularly valuable for logP and solubility.
USE_PHYSICOCHEMICAL_DESCRIPTORS = True
NUM_PHYSCHEM_DESCRIPTORS = 20  # appended to fingerprint vector

# Total feature vector length
_MACCS_BITS = MACCS_NBITS if USE_MACCS_KEYS else 0
TOTAL_FEATURES = MORGAN_NBITS + _MACCS_BITS + (NUM_PHYSCHEM_DESCRIPTORS if USE_PHYSICOCHEMICAL_DESCRIPTORS else 0)

# ─── Dataset Configurations ───
DATASET_CONFIGS = {
    "solubility": {
        "file": "esol.csv",
        "smiles_col": "smiles",
        "target_col": "measured log solubility in mols per litre",
        "task": "regression",
        "description": "Aqueous Solubility (logS) — ESOL Dataset",
        "target_unit": "logS (mol/L)",
        "normalize_target": False,  # Already in log scale
    },
    "logp": {
        "file": "lipophilicity.csv",
        "smiles_col": "smiles",
        "target_col": "exp",
        "task": "regression",
        "description": "Lipophilicity (logD at pH 7.4) — MoleculeNet",
        "target_unit": "logD",
        "normalize_target": False,  # Already in log scale
    },
    "bbbp": {
        "file": "bbbp.csv",
        "smiles_col": "smiles",
        "target_col": "p_np",
        "task": "classification",
        "description": "Blood-Brain Barrier Penetration — BBBP",
        "target_unit": "binary (1=permeable, 0=non-permeable)",
        "normalize_target": False,
    },
    "toxicity": {
        "file": "clintox.csv",
        "smiles_col": "smiles",
        "target_col": "CT_TOX",
        "task": "classification",
        "description": "Clinical Trial Toxicity — ClinTox",
        "target_unit": "binary (1=toxic, 0=non-toxic)",
        "normalize_target": False,
    },
}

# Map property names to task types
PROPERTY_TASKS = {
    name: cfg["task"] for name, cfg in DATASET_CONFIGS.items()
}

# ─── Model Configuration ───
# Default hyperparameters (overridden by Optuna tuning)
DEFAULT_RF_PARAMS = {
    "n_estimators": 1500,       # ↑ from 800: more trees reduce variance
    "max_depth": 25,            # Bounded depth prevents overfitting on larger feature sets
    "min_samples_split": 4,
    "min_samples_leaf": 2,      # Smoothing — reduces noise on small scaffolds
    "max_features": 0.3,        # Fraction: better for high-dim FP vectors than "sqrt"
    "class_weight": "balanced",  # Handle class imbalance for classification
    "bootstrap": True,
    "oob_score": True,          # Out-of-bag score for free validation
    "n_jobs": -1,
    "random_state": 42,
}

DEFAULT_XGB_PARAMS = {
    "n_estimators": 2000,       # ↑ from 500: more rounds with lower LR
    "max_depth": 8,             # ↑ from 7: slightly deeper for complex SAR
    "learning_rate": 0.015,     # ↓ from 0.03: slower learning → better generalization
    "subsample": 0.8,
    "colsample_bytree": 0.6,    # ↓ from 0.75: more aggressive feature sampling for 4K+ dims
    "colsample_bylevel": 0.7,   # Additional column sampling per level
    "min_child_weight": 5,      # ↑ from 3: prevents splits on tiny leaf groups
    "gamma": 0.2,               # ↑ from 0.1: require larger gain for split
    "reg_alpha": 0.1,           # ↑ from 0.05: stronger L1 regularization
    "reg_lambda": 2.0,          # ↑ from 1.5: stronger L2 regularization
    "max_delta_step": 1,        # Helps with imbalanced classification
    "random_state": 42,
    "verbosity": 0,
    "n_jobs": -1,
}

# Early stopping config for XGBoost
# Prevents overfitting by halting training when validation loss plateaus.
XGB_EARLY_STOPPING_ROUNDS = 50
XGB_EVAL_METRIC_REG = "rmse"
XGB_EVAL_METRIC_CLS = "logloss"

# Ensemble weights — determined empirically.
# XGBoost typically outperforms RF on structured tabular data by 3-7%,
# but RF provides better-calibrated uncertainty estimates.
# Weights are re-computed after cross-validation.
DEFAULT_ENSEMBLE_WEIGHTS = {
    "random_forest": 0.35,
    "xgboost": 0.65,
}

# ─── Evaluation Configuration ───
CV_FOLDS = 5
TEST_SIZE = 0.2
SCAFFOLD_SPLIT_SEED = 42

# ─── Optuna Configuration ───
OPTUNA_N_TRIALS = 80     # ↑ from 50: more thorough search
OPTUNA_TIMEOUT = 900     # ↑ from 600: allow more time for larger models
OPTUNA_SEED = 42

# ─── SMOTE Configuration (for imbalanced classification) ───
# ClinTox has ~7% positive rate — severe class imbalance degrades model quality.
# SMOTE generates synthetic minority samples by interpolating between existing
# minority-class molecules in fingerprint space.
USE_SMOTE = True
SMOTE_SAMPLING_STRATEGY = 0.3  # Target 30% minority ratio (from ~7%)

# ─── Server Configuration ───
FLASK_PORT = int(os.environ.get("PORT", 5001))
MODEL_VERSION = "4.0.0"

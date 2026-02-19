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
DESCRIPTOR_VERSION = "ecfp4_2048_v3"

# Morgan Fingerprint parameters
# Radius=2 → ECFP4 (Extended Connectivity FP, diameter 4)
# This captures atoms within 2 bonds of each center, yielding substructural
# fragments of diameter 4. ECFP4 is the most widely validated fingerprint
# in published QSAR/QSPR literature (Rogers & Hahn, 2010).
#
# nBits=2048 → Standard bit vector length.
# 1024 bits risks collision at ~40% with >50 unique fragments.
# 2048 bits reduces collision probability to ~20% for typical drug-like molecules.
# 4096 bits offers marginal improvement at 2× memory cost — not justified
# for datasets under 50K compounds.
MORGAN_RADIUS = 2
MORGAN_NBITS = 2048

# Additional RDKit physicochemical descriptors appended to fingerprints
# v3: Expanded from 8 → 14 descriptors for better coverage of molecular
# property space. Added: QED, MolarRefractivity, RingCount, HeavyAtomCount,
# BertzCT (topological complexity), NumHeteroatoms.
# These capture global molecular properties that fingerprints miss:
# MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3,
# QED, MolarRefractivity, RingCount, HeavyAtomCount, BertzCT, NumHeteroatoms
USE_PHYSICOCHEMICAL_DESCRIPTORS = True
NUM_PHYSCHEM_DESCRIPTORS = 14  # appended to fingerprint vector

# Total feature vector length
TOTAL_FEATURES = MORGAN_NBITS + (NUM_PHYSCHEM_DESCRIPTORS if USE_PHYSICOCHEMICAL_DESCRIPTORS else 0)

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
    "n_estimators": 800,
    "max_depth": None,  # Let trees grow fully
    "min_samples_split": 3,
    "min_samples_leaf": 1,
    "max_features": "sqrt",
    "class_weight": "balanced",  # Handle class imbalance for classification
    "n_jobs": -1,
    "random_state": 42,
}

DEFAULT_XGB_PARAMS = {
    "n_estimators": 500,
    "max_depth": 7,
    "learning_rate": 0.03,
    "subsample": 0.85,
    "colsample_bytree": 0.75,
    "min_child_weight": 3,
    "gamma": 0.1,
    "reg_alpha": 0.05,
    "reg_lambda": 1.5,
    "random_state": 42,
    "verbosity": 0,
    "n_jobs": -1,
}

# Ensemble weights — determined empirically.
# XGBoost typically outperforms RF on structured tabular data by 3-7%,
# but RF provides better-calibrated uncertainty estimates.
# Weights are re-computed after cross-validation.
DEFAULT_ENSEMBLE_WEIGHTS = {
    "random_forest": 0.4,
    "xgboost": 0.6,
}

# ─── Evaluation Configuration ───
CV_FOLDS = 5
TEST_SIZE = 0.2
SCAFFOLD_SPLIT_SEED = 42

# ─── Optuna Configuration ───
OPTUNA_N_TRIALS = 50
OPTUNA_TIMEOUT = 600  # seconds
OPTUNA_SEED = 42

# ─── Server Configuration ───
FLASK_PORT = 5001
MODEL_VERSION = "3.0.0"

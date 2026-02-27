"""
qspr — Scientifically Rigorous QSPR Modelling Engine
======================================================
A modular Quantitative Structure–Property Relationship (QSPR) pipeline
for the InSilico AI drug discovery platform.

Key components:
  - Morgan fingerprints (ECFP4, 4096 bits) + MACCS keys as primary molecular representation
  - 20 physicochemical descriptors for global property coverage
  - Scaffold-based data splitting for chemically valid evaluation
  - Ensemble models (RandomForest + XGBoost) with uncertainty estimation
  - XGBoost early stopping to prevent overfitting
  - SMOTE oversampling for imbalanced classification endpoints
  - Optuna-driven hyperparameter optimization (80 trials)
  - 5-fold scaffold cross-validation with rigorous metrics

Architecture decisions:
  1. Morgan FP radius=2, 4096 bits (ECFP4) + MACCS 167 keys — complementary fingerprints.
  2. Scaffold split (Bemis–Murcko) — prevents data leakage in drug discovery.
  3. Ensemble variance as confidence — provides actionable uncertainty bounds.
  4. Separate training vs. inference logic — production safety.
  5. Early stopping — prevents XGBoost overfitting on small datasets.

Author: InSilico AI Platform
"""

__version__ = "4.0.0"

from .config import DATASET_CONFIGS, PROPERTY_TASKS, DESCRIPTOR_VERSION
from .datasets import QSPRDataset
from .fingerprints import MorganFingerprintCalculator, compute_rdkit_properties, compute_drug_likeness
from .splitting import ScaffoldSplitter, RandomSplitter
from .models import QSPRModel, RandomForestQSPR, XGBoostQSPR
from .ensemble import QSPREnsemble
from .evaluation import QSPREvaluator
from .serialization import ModelSerializer
from .tuning import OptunaTuner

__all__ = [
    "DATASET_CONFIGS",
    "PROPERTY_TASKS",
    "DESCRIPTOR_VERSION",
    "QSPRDataset",
    "MorganFingerprintCalculator",
    "compute_rdkit_properties",
    "compute_drug_likeness",
    "ScaffoldSplitter",
    "RandomSplitter",
    "QSPRModel",
    "RandomForestQSPR",
    "XGBoostQSPR",
    "QSPREnsemble",
    "QSPREvaluator",
    "ModelSerializer",
    "OptunaTuner",
]

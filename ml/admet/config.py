"""
config.py — ADMET System Central Configuration
================================================
All constants, paths, dataset configs, model hyperparameters,
and endpoint definitions for the domain-aware ADMET system.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ─── Paths ───
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "admet")
MODEL_DIR = os.path.join(BASE_DIR, "models", "admet")
CACHE_DIR = os.path.join(BASE_DIR, "data", "admet", ".cache")

# Ensure directories exist
for _d in (DATA_DIR, MODEL_DIR, CACHE_DIR):
    os.makedirs(_d, exist_ok=True)

# ─── Descriptor Configuration ───
DESCRIPTOR_VERSION = "ecfp6_2048_hybrid_v1"

# ECFP6 fingerprint (radius=3 → diameter 6)
# ECFP6 captures larger substructural neighborhoods than ECFP4, which is
# critical for distinguishing nucleoside analogues and phosphoramidates
# that share similar core structures but differ at periphery.
# Ref: Rogers & Hahn, J. Chem. Inf. Model., 2010, 50, 742-754.
MORGAN_RADIUS = 3       # ECFP6
MORGAN_NBITS = 2048

# Extended physicochemical descriptors (26 total — up from 14 in QSPR v2)
# Added: LabuteASA, PEOE_VSA descriptors, BalabanJ, Chi0n, Kappa indices,
# NumAliphaticRings, NumSaturatedRings, NumAromaticHeterocycles,
# NHOHCount, NOCount, NumRadicalElectrons, MaxPartialCharge
NUM_PHYSCHEM_DESCRIPTORS = 26

# Topological descriptors (8)
NUM_TOPOLOGICAL_DESCRIPTORS = 8

# Functional group indicators (12)
NUM_FUNCTIONAL_GROUP_FEATURES = 12

# Total features
TOTAL_FEATURES = (
    MORGAN_NBITS
    + NUM_PHYSCHEM_DESCRIPTORS
    + NUM_TOPOLOGICAL_DESCRIPTORS
    + NUM_FUNCTIONAL_GROUP_FEATURES
)  # 2094

# ─── MW / TPSA Stratification Bins ───
MW_BINS = [0, 400, 600, 800]          # 3 bins
MW_BIN_LABELS = ["small", "medium", "large"]
TPSA_BINS = [0, 100, 200, 250]       # 3 bins
TPSA_BIN_LABELS = ["low", "moderate", "high"]

# ─── ADMET Endpoint Definitions ───
ADMET_ENDPOINTS = {
    # ── Absorption ──
    "solubility": {
        "task": "regression",
        "description": "Aqueous Solubility (logS)",
        "unit": "logS (mol/L)",
        "reference_scale": 2.0,
    },
    "caco2": {
        "task": "regression",
        "description": "Caco-2 Cell Permeability",
        "unit": "log Papp (cm/s)",
        "reference_scale": 1.5,
    },
    "pgp_substrate": {
        "task": "classification",
        "description": "P-glycoprotein Substrate",
        "unit": "binary (1=substrate, 0=non-substrate)",
        "reference_scale": 1.0,
    },
    "oral_bioavailability": {
        "task": "classification",
        "description": "Oral Bioavailability ≥30%",
        "unit": "binary (1=bioavailable, 0=poor)",
        "reference_scale": 1.0,
    },

    # ── Distribution ──
    "logp": {
        "task": "regression",
        "description": "Lipophilicity (logP/logD)",
        "unit": "logP",
        "reference_scale": 2.0,
    },
    "bbbp": {
        "task": "classification",
        "description": "Blood-Brain Barrier Penetration",
        "unit": "binary (1=permeable, 0=non-permeable)",
        "reference_scale": 1.0,
    },
    "ppb": {
        "task": "regression",
        "description": "Plasma Protein Binding",
        "unit": "fraction bound (0-1)",
        "reference_scale": 0.3,
    },
    "vdss": {
        "task": "regression",
        "description": "Volume of Distribution at Steady State",
        "unit": "log(VDss) L/kg",
        "reference_scale": 1.5,
    },

    # ── Metabolism ──
    "cyp2d6_inhibitor": {
        "task": "classification",
        "description": "CYP2D6 Inhibition",
        "unit": "binary (1=inhibitor, 0=non-inhibitor)",
        "reference_scale": 1.0,
    },
    "cyp3a4_inhibitor": {
        "task": "classification",
        "description": "CYP3A4 Inhibition",
        "unit": "binary (1=inhibitor, 0=non-inhibitor)",
        "reference_scale": 1.0,
    },
    "cyp2c9_inhibitor": {
        "task": "classification",
        "description": "CYP2C9 Inhibition",
        "unit": "binary (1=inhibitor, 0=non-inhibitor)",
        "reference_scale": 1.0,
    },
    "half_life": {
        "task": "regression",
        "description": "Human Half-Life",
        "unit": "log(t1/2) hours",
        "reference_scale": 1.5,
    },

    # ── Excretion ──
    "clearance": {
        "task": "regression",
        "description": "Total Clearance",
        "unit": "log(CL) mL/min/kg",
        "reference_scale": 1.0,
    },

    # ── Toxicity ──
    "toxicity": {
        "task": "classification",
        "description": "Clinical Trial Toxicity",
        "unit": "binary (1=toxic, 0=non-toxic)",
        "reference_scale": 1.0,
    },
    "herg": {
        "task": "classification",
        "description": "hERG Channel Inhibition (Cardiotoxicity)",
        "unit": "binary (1=blocker, 0=non-blocker)",
        "reference_scale": 1.0,
    },
    "ames": {
        "task": "classification",
        "description": "Ames Mutagenicity",
        "unit": "binary (1=mutagen, 0=non-mutagen)",
        "reference_scale": 1.0,
    },
    "dili": {
        "task": "classification",
        "description": "Drug-Induced Liver Injury",
        "unit": "binary (1=DILI, 0=non-DILI)",
        "reference_scale": 1.0,
    },
}

# Map endpoint → task type
ENDPOINT_TASKS = {
    name: cfg["task"] for name, cfg in ADMET_ENDPOINTS.items()
}


# ─── Dataset Source Configurations ───
DATASET_SOURCES = {
    "moleculenet": {
        "description": "MoleculeNet benchmark datasets (local)",
        "datasets": {
            "solubility": {"file": "esol.csv", "smiles_col": "smiles",
                          "target_col": "measured log solubility in mols per litre"},
            "logp": {"file": "lipophilicity.csv", "smiles_col": "smiles",
                    "target_col": "exp"},
            "bbbp": {"file": "bbbp.csv", "smiles_col": "smiles",
                    "target_col": "p_np"},
            "toxicity": {"file": "clintox.csv", "smiles_col": "smiles",
                        "target_col": "CT_TOX"},
        },
    },
    "admetlab": {
        "description": "ADMETlab 2.0 curated ADMET data",
        "base_url": "https://admetlab3.scbdd.com",
        "endpoints": [
            "caco2", "pgp_substrate", "bbbp", "ppb",
            "cyp2d6_inhibitor", "cyp3a4_inhibitor", "cyp2c9_inhibitor",
            "half_life", "clearance", "herg", "ames", "dili",
        ],
    },
    "chembl": {
        "description": "ChEMBL bioactivity database",
        "base_url": "https://www.ebi.ac.uk/chembl/api/data",
        "filters": {
            "mw_range": (100, 800),
            "tpsa_range": (0, 250),
            "assay_type": "B",  # Binding assays
        },
    },
    "pubchem": {
        "description": "PubChem antiviral bioassays",
        "base_url": "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
        "target_assays": {
            "sars_mpro": [1706, 2289, 1479718],
            "rdrp": [1347423, 1479719],
        },
    },
    "drugbank": {
        "description": "DrugBank approved drug database",
        "use_for": ["prodrug_labels", "bioavailability_ground_truth",
                    "route_of_administration"],
    },
    "zinc15": {
        "description": "ZINC15 drug-like chemical space",
        "base_url": "https://zinc15.docking.org/substances",
        "subsets": ["in-vivo", "fda", "world"],
    },
}


# ─── Model Hyperparameters ───
DEFAULT_RF_PARAMS = {
    "n_estimators": 1000,
    "max_depth": None,
    "min_samples_split": 3,
    "min_samples_leaf": 1,
    "max_features": "sqrt",
    "class_weight": "balanced",
    "n_jobs": -1,
    "random_state": 42,
}

DEFAULT_XGB_PARAMS = {
    "n_estimators": 600,
    "max_depth": 8,
    "learning_rate": 0.02,
    "subsample": 0.85,
    "colsample_bytree": 0.7,
    "min_child_weight": 3,
    "gamma": 0.1,
    "reg_alpha": 0.05,
    "reg_lambda": 1.5,
    "random_state": 42,
    "verbosity": 0,
    "n_jobs": -1,
}

# ─── Ensemble Routing Thresholds ───
ROUTING_THRESHOLDS = {
    "small_oral": {"mw_max": 500, "tpsa_max": 140},
    "large_antiviral": {"mw_min": 500, "mw_max": 800, "tpsa_max": 250},
    "prodrug": {"requires_prodrug_detection": True},
}

# ─── Applicability Domain Defaults ───
DOMAIN_DEFAULTS = {
    "tanimoto_threshold": 0.3,         # Min similarity to training set
    "mahalanobis_threshold": 3.0,      # z-score threshold
    "leverage_threshold_factor": 3.0,  # h* = factor * (p+1)/n
    "isolation_forest_contamination": 0.05,
    "pca_components": 50,
}

# ─── Evaluation ───
CV_FOLDS = 5
TEST_SIZE = 0.2
SCAFFOLD_SPLIT_SEED = 42
OPTUNA_N_TRIALS = 80
OPTUNA_TIMEOUT = 900  # seconds

# ─── Server ───
MODEL_VERSION = "4.0.0"


@dataclass
class ADMETConfig:
    """Runtime configuration for the ADMET prediction system."""

    descriptor_version: str = DESCRIPTOR_VERSION
    morgan_radius: int = MORGAN_RADIUS
    morgan_nbits: int = MORGAN_NBITS
    total_features: int = TOTAL_FEATURES
    model_dir: str = MODEL_DIR
    data_dir: str = DATA_DIR
    model_version: str = MODEL_VERSION

    # Which endpoints to train
    active_endpoints: List[str] = field(default_factory=lambda: list(ADMET_ENDPOINTS.keys()))

    # Routing configuration
    enable_routing: bool = True
    enable_prodrug_detection: bool = True
    enable_metabolism_correction: bool = True
    enable_applicability_domain: bool = True

    def get_endpoint_config(self, endpoint: str) -> dict:
        if endpoint not in ADMET_ENDPOINTS:
            raise ValueError(f"Unknown endpoint: {endpoint}")
        return ADMET_ENDPOINTS[endpoint]

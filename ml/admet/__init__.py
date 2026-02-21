"""
admet — Domain-Aware, Dataset-Optimized ADMET Prediction System
=================================================================
Production-grade ADMET (Absorption, Distribution, Metabolism, Excretion,
Toxicity) prediction with applicability domain awareness, prodrug detection,
metabolism-informed bioavailability, and ensemble routing across diverse
chemical space (MW up to 800 Da, TPSA up to 250 Å²).

Architecture:
  ┌─────────────────────────────────────────────────────────────┐
  │  Input: SMILES                                              │
  │    ↓                                                        │
  │  Feature Engineering (ECFP6 + PhysChem + Topological)       │
  │    ↓                                                        │
  │  Applicability Domain Check (Tanimoto + Mahalanobis + PCA)  │
  │    ↓                                                        │
  │  Ensemble Router (MW / TPSA / Functional Group)             │
  │    ├── Small Oral Drug Model (MW < 500)                     │
  │    ├── Large Antiviral Model (MW 500-800)                   │
  │    └── Prodrug Model (phosphoramidate / ester prodrugs)     │
  │    ↓                                                        │
  │  Metabolism-Aware Post-Processing                           │
  │    ├── CYP450 Inhibition                                    │
  │    ├── P-gp Substrate Status                                │
  │    └── Plasma Protein Binding                               │
  │    ↓                                                        │
  │  Output: Prediction + Confidence + Domain Status            │
  └─────────────────────────────────────────────────────────────┘

Modules:
  admet.config           — Central configuration
  admet.data             — Dataset fetching, preprocessing, stratification
  admet.features         — Hybrid fingerprint & descriptor engineering
  admet.domain           — Applicability domain assessment
  admet.models           — Prodrug detection, metabolism, routing
  admet.evaluation       — Stratified validation, calibration
"""

__version__ = "1.0.0"

from .config import ADMETConfig, ADMET_ENDPOINTS

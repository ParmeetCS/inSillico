"""
datasets.py — QSPR Dataset Loading and Preprocessing
======================================================
Handles CSV loading, SMILES validation, deduplication, missing value
handling, and target normalization.

Scientific rationale:
  - SMILES canonicalization ensures unique molecular representation.
  - Invalid SMILES are detected early to prevent silent failures.
  - Duplicate removal prevents train/test leakage.
  - Target normalization stabilizes gradient-based learners (optional).
"""

import os
import logging
import numpy as np
import pandas as pd
from typing import Tuple, Optional, List, Dict
from rdkit import Chem
from rdkit import RDLogger

from .config import DATA_DIR

logger = logging.getLogger("qspr.datasets")

# Suppress RDKit warnings for invalid SMILES (we handle these explicitly)
RDLogger.logger().setLevel(RDLogger.ERROR)


class QSPRDataset:
    """
    A validated, preprocessed molecular dataset for QSPR modelling.

    Pipeline:
      1. Load CSV with SMILES + target columns
      2. Canonicalize SMILES (unique molecular representation)
      3. Remove invalid SMILES
      4. Remove duplicates (keep first occurrence)
      5. Handle missing target values
      6. Optionally normalize targets (z-score for regression)

    Attributes:
        smiles: List of validated, canonical SMILES strings
        targets: numpy array of target values
        name: Property name (e.g., "logp", "solubility")
        task: "regression" or "classification"
        stats: Dict with dataset statistics
    """

    def __init__(
        self,
        name: str,
        smiles: List[str],
        targets: np.ndarray,
        task: str,
        description: str = "",
        target_unit: str = "",
    ):
        self.name = name
        self.smiles = smiles
        self.targets = targets
        self.task = task
        self.description = description
        self.target_unit = target_unit
        self._target_mean: Optional[float] = None
        self._target_std: Optional[float] = None

        self.stats = self._compute_stats()

    def _compute_stats(self) -> Dict:
        """Compute dataset statistics for reporting."""
        stats = {
            "n_samples": len(self.smiles),
            "task_type": self.task,
        }

        if self.task == "regression":
            stats.update({
                "target_mean": float(np.mean(self.targets)),
                "target_std": float(np.std(self.targets)),
                "target_min": float(np.min(self.targets)),
                "target_max": float(np.max(self.targets)),
                "target_median": float(np.median(self.targets)),
            })
        else:
            unique, counts = np.unique(self.targets, return_counts=True)
            stats.update({
                "class_distribution": {int(k): int(v) for k, v in zip(unique, counts)},
                "class_balance": float(min(counts) / max(counts)),
            })

        return stats

    def normalize_targets(self) -> None:
        """
        Z-score normalize regression targets.
        Stores mean/std for inverse transform during inference.
        """
        if self.task != "regression":
            logger.warning("Target normalization skipped: classification task.")
            return

        self._target_mean = float(np.mean(self.targets))
        self._target_std = float(np.std(self.targets))

        if self._target_std < 1e-8:
            logger.warning("Target std ≈ 0, skipping normalization.")
            return

        self.targets = (self.targets - self._target_mean) / self._target_std
        logger.info(
            f"Normalized targets: mean={self._target_mean:.4f}, "
            f"std={self._target_std:.4f}"
        )

    def denormalize_prediction(self, value: float) -> float:
        """Inverse-transform a normalized prediction back to original scale."""
        if self._target_mean is not None and self._target_std is not None:
            return value * self._target_std + self._target_mean
        return value

    @classmethod
    def from_csv(
        cls,
        name: str,
        filepath: str,
        smiles_col: str,
        target_col: str,
        task: str,
        description: str = "",
        target_unit: str = "",
        normalize: bool = False,
    ) -> "QSPRDataset":
        """
        Load a QSPR dataset from a CSV file with full validation.

        Steps:
          1. Read CSV
          2. Case-insensitive column matching
          3. Drop missing values
          4. Canonicalize and validate SMILES
          5. Remove duplicates
          6. Optionally normalize targets

        Args:
            name: Property identifier (e.g., "logp")
            filepath: Path to CSV file
            smiles_col: Column name for SMILES
            target_col: Column name for target values
            task: "regression" or "classification"
            description: Human-readable description
            target_unit: Unit string for reporting
            normalize: Whether to z-score normalize targets

        Returns:
            Validated QSPRDataset instance
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(
                f"Dataset not found: {filepath}\n"
                f"Run download_moleculenet.py first."
            )

        logger.info(f"Loading dataset: {name} from {filepath}")

        df = pd.read_csv(filepath)
        logger.info(f"  Raw rows: {len(df):,}")

        # Case-insensitive column matching
        col_map = {c.lower(): c for c in df.columns}
        actual_smiles_col = col_map.get(smiles_col.lower(), smiles_col)
        actual_target_col = col_map.get(target_col.lower(), target_col)

        if actual_smiles_col not in df.columns:
            raise ValueError(
                f"SMILES column '{smiles_col}' not found. "
                f"Available: {list(df.columns)}"
            )
        if actual_target_col not in df.columns:
            raise ValueError(
                f"Target column '{target_col}' not found. "
                f"Available: {list(df.columns)}"
            )

        # Drop rows with missing SMILES or target
        df = df.dropna(subset=[actual_smiles_col, actual_target_col])
        logger.info(f"  After dropping NaN: {len(df):,}")

        # Validate and canonicalize SMILES
        valid_smiles = []
        valid_targets = []
        invalid_count = 0
        seen_canonical = set()

        for _, row in df.iterrows():
            raw_smi = str(row[actual_smiles_col]).strip()
            if not raw_smi or raw_smi.lower() == "nan":
                invalid_count += 1
                continue

            mol = Chem.MolFromSmiles(raw_smi)
            if mol is None:
                invalid_count += 1
                continue

            # Canonicalize to ensure unique representation
            canonical = Chem.MolToSmiles(mol, canonical=True)

            # Deduplication by canonical SMILES
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)

            valid_smiles.append(canonical)
            valid_targets.append(float(row[actual_target_col]))

        targets = np.array(valid_targets)

        logger.info(f"  Valid molecules: {len(valid_smiles):,}")
        logger.info(f"  Invalid/skipped: {invalid_count}")
        logger.info(f"  Duplicates removed: {len(df) - invalid_count - len(valid_smiles)}")

        dataset = cls(
            name=name,
            smiles=valid_smiles,
            targets=targets,
            task=task,
            description=description,
            target_unit=target_unit,
        )

        if normalize and task == "regression":
            dataset.normalize_targets()

        return dataset

    @classmethod
    def from_config(cls, prop_name: str, normalize: bool = False) -> "QSPRDataset":
        """
        Load a dataset using the predefined configuration in config.py.

        Args:
            prop_name: Property name key (e.g., "logp", "solubility", "bbbp", "toxicity")
            normalize: Whether to z-score normalize regression targets

        Returns:
            QSPRDataset instance
        """
        from .config import DATASET_CONFIGS

        if prop_name not in DATASET_CONFIGS:
            raise ValueError(
                f"Unknown property: '{prop_name}'. "
                f"Available: {list(DATASET_CONFIGS.keys())}"
            )

        cfg = DATASET_CONFIGS[prop_name]
        filepath = os.path.join(DATA_DIR, cfg["file"])

        return cls.from_csv(
            name=prop_name,
            filepath=filepath,
            smiles_col=cfg["smiles_col"],
            target_col=cfg["target_col"],
            task=cfg["task"],
            description=cfg["description"],
            target_unit=cfg.get("target_unit", ""),
            normalize=normalize and cfg.get("normalize_target", False),
        )

    def __len__(self) -> int:
        return len(self.smiles)

    def __repr__(self) -> str:
        return (
            f"QSPRDataset(name='{self.name}', n={len(self)}, "
            f"task='{self.task}', desc='{self.description}')"
        )

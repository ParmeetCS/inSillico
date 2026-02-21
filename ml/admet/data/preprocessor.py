"""
preprocessor.py — ADMET Data Preprocessing & Stratification
=============================================================
Unified preprocessing pipeline:
  1. Canonical SMILES standardization
  2. Salt stripping
  3. Duplicate removal across datasets
  4. MW / TPSA stratification
  5. Balanced bin sampling

Handles merging data from multiple sources (MoleculeNet, ChEMBL,
PubChem, DrugBank, ZINC) into a unified, stratified dataset.
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass, field
from rdkit import Chem
from rdkit.Chem import Descriptors, SaltRemover, AllChem
from rdkit import RDLogger

from ..config import MW_BINS, MW_BIN_LABELS, TPSA_BINS, TPSA_BIN_LABELS

logger = logging.getLogger("admet.data.preprocessor")
RDLogger.logger().setLevel(RDLogger.ERROR)

# RDKit salt remover with standard salts
_salt_remover = SaltRemover.SaltRemover()


@dataclass
class StratifiedDataset:
    """
    A preprocessed, stratified molecular dataset for ADMET modelling.

    Attributes:
        name: Endpoint name (e.g., "solubility", "cyp3a4_inhibitor")
        smiles: List of validated canonical SMILES
        targets: Target values as numpy array
        task: "regression" or "classification"
        mw_bins: MW bin assignment per molecule
        tpsa_bins: TPSA bin assignment per molecule
        source_labels: Origin dataset per molecule
        stats: Dataset statistics
    """
    name: str
    smiles: List[str]
    targets: np.ndarray
    task: str
    description: str = ""
    target_unit: str = ""
    mw_bins: Optional[np.ndarray] = None
    tpsa_bins: Optional[np.ndarray] = None
    source_labels: Optional[List[str]] = None
    stats: Dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.stats:
            self.stats = self._compute_stats()

    def _compute_stats(self) -> Dict:
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
                "class_balance": float(min(counts) / max(counts)) if len(counts) > 1 else 0.0,
            })

        if self.mw_bins is not None:
            mw_unique, mw_counts = np.unique(self.mw_bins, return_counts=True)
            stats["mw_distribution"] = {str(k): int(v) for k, v in zip(mw_unique, mw_counts)}

        if self.tpsa_bins is not None:
            tpsa_unique, tpsa_counts = np.unique(self.tpsa_bins, return_counts=True)
            stats["tpsa_distribution"] = {str(k): int(v) for k, v in zip(tpsa_unique, tpsa_counts)}

        if self.source_labels is not None:
            source_series = pd.Series(self.source_labels)
            stats["source_distribution"] = source_series.value_counts().to_dict()

        return stats

    def __len__(self) -> int:
        return len(self.smiles)

    def __repr__(self) -> str:
        return (
            f"StratifiedDataset(name='{self.name}', n={len(self)}, "
            f"task='{self.task}')"
        )


class ADMETPreprocessor:
    """
    Unified preprocessing pipeline for ADMET datasets.

    Handles:
      - SMILES canonicalization
      - Salt stripping (remove counterions)
      - Cross-dataset deduplication
      - MW / TPSA bin assignment
      - Distribution balancing across bins
    """

    def __init__(
        self,
        mw_bins: List[float] = None,
        tpsa_bins: List[float] = None,
        strip_salts: bool = True,
        remove_stereo: bool = False,
    ):
        self.mw_bins = mw_bins or MW_BINS
        self.tpsa_bins = tpsa_bins or TPSA_BINS
        self.strip_salts = strip_salts
        self.remove_stereo = remove_stereo
        self._seen_canonical: Set[str] = set()

    def reset_dedup_cache(self):
        """Reset deduplication cache (call between independent datasets)."""
        self._seen_canonical.clear()

    def standardize_smiles(self, smiles: str) -> Optional[str]:
        """
        Standardize a SMILES string:
          1. Parse to RDKit Mol
          2. Strip salts (keep largest fragment)
          3. Optionally remove stereochemistry
          4. Canonicalize

        Returns None if the SMILES is invalid.
        """
        if not smiles or not isinstance(smiles, str):
            return None

        smiles = smiles.strip()
        if not smiles or smiles.lower() == "nan":
            return None

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None

        # Salt stripping
        if self.strip_salts:
            try:
                mol = _salt_remover.StripMol(mol, dontRemoveEverything=True)
            except Exception:
                pass  # Keep original if salt removal fails

            # If multi-fragment, keep largest
            frags = Chem.GetMolFrags(mol, asMols=True)
            if len(frags) > 1:
                mol = max(frags, key=lambda m: m.GetNumHeavyAtoms())

        # Remove stereochemistry if requested
        if self.remove_stereo:
            Chem.RemoveStereochemistry(mol)

        # Canonicalize
        try:
            canonical = Chem.MolToSmiles(mol, canonical=True)
            # Re-parse to ensure validity
            check_mol = Chem.MolFromSmiles(canonical)
            if check_mol is None:
                return None
            return canonical
        except Exception:
            return None

    def compute_properties(self, smiles: str) -> Optional[Dict]:
        """Compute MW and TPSA for stratification."""
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        return {
            "mw": Descriptors.MolWt(mol),
            "tpsa": Descriptors.TPSA(mol),
        }

    def assign_mw_bin(self, mw: float) -> str:
        """Assign a molecular weight bin label."""
        for i in range(len(self.mw_bins) - 1):
            if mw < self.mw_bins[i + 1]:
                return MW_BIN_LABELS[i]
        return MW_BIN_LABELS[-1]

    def assign_tpsa_bin(self, tpsa: float) -> str:
        """Assign a TPSA bin label."""
        for i in range(len(self.tpsa_bins) - 1):
            if tpsa < self.tpsa_bins[i + 1]:
                return TPSA_BIN_LABELS[i]
        return TPSA_BIN_LABELS[-1]

    def preprocess_dataframe(
        self,
        df: pd.DataFrame,
        smiles_col: str,
        target_col: str,
        source_label: str = "unknown",
        deduplicate_global: bool = True,
    ) -> pd.DataFrame:
        """
        Full preprocessing pipeline for a raw DataFrame.

        Steps:
          1. Drop missing values
          2. Standardize SMILES (salt strip + canonicalize)
          3. Compute MW / TPSA
          4. Assign stratification bins
          5. Deduplicate (optionally within global cache)

        Args:
            df: DataFrame with SMILES and target columns
            smiles_col: Column name for SMILES
            target_col: Column name for target values
            source_label: Origin dataset name
            deduplicate_global: If True, dedup against previously seen molecules

        Returns:
            Cleaned DataFrame with columns:
              [smiles, target, mw, tpsa, mw_bin, tpsa_bin, source]
        """
        # Case-insensitive column matching
        col_map = {c.lower(): c for c in df.columns}
        actual_smiles = col_map.get(smiles_col.lower(), smiles_col)
        actual_target = col_map.get(target_col.lower(), target_col)

        if actual_smiles not in df.columns or actual_target not in df.columns:
            raise ValueError(
                f"Columns not found. Need: {smiles_col}, {target_col}. "
                f"Have: {list(df.columns)}"
            )

        # Drop NaN
        df = df.dropna(subset=[actual_smiles, actual_target]).copy()
        initial_n = len(df)
        logger.info(f"  [{source_label}] Starting with {initial_n:,} rows")

        results = []
        invalid_count = 0

        for _, row in df.iterrows():
            raw_smi = str(row[actual_smiles]).strip()
            canonical = self.standardize_smiles(raw_smi)
            if canonical is None:
                invalid_count += 1
                continue

            # Global deduplication
            if deduplicate_global:
                if canonical in self._seen_canonical:
                    continue
                self._seen_canonical.add(canonical)

            props = self.compute_properties(canonical)
            if props is None:
                invalid_count += 1
                continue

            results.append({
                "smiles": canonical,
                "target": float(row[actual_target]),
                "mw": props["mw"],
                "tpsa": props["tpsa"],
                "mw_bin": self.assign_mw_bin(props["mw"]),
                "tpsa_bin": self.assign_tpsa_bin(props["tpsa"]),
                "source": source_label,
            })

        result_df = pd.DataFrame(results)
        logger.info(
            f"  [{source_label}] Valid: {len(result_df):,}, "
            f"Invalid: {invalid_count}, "
            f"Deduped: {initial_n - invalid_count - len(result_df)}"
        )

        return result_df

    def merge_datasets(
        self,
        dataframes: List[pd.DataFrame],
    ) -> pd.DataFrame:
        """
        Merge multiple preprocessed DataFrames with cross-dataset deduplication.

        Uses the global seen_canonical cache to ensure uniqueness.
        """
        if not dataframes:
            return pd.DataFrame()

        merged = pd.concat(dataframes, ignore_index=True)

        # Final deduplication by canonical SMILES (keep first occurrence)
        merged = merged.drop_duplicates(subset=["smiles"], keep="first")

        logger.info(f"  Merged dataset: {len(merged):,} unique molecules")
        return merged

    def balance_bins(
        self,
        df: pd.DataFrame,
        bin_col: str = "mw_bin",
        max_ratio: float = 3.0,
        random_state: int = 42,
    ) -> pd.DataFrame:
        """
        Balance distribution across stratification bins.

        If the largest bin is more than max_ratio × the smallest,
        downsample the larger bins.

        Args:
            df: Preprocessed DataFrame
            bin_col: Column to balance on
            max_ratio: Maximum allowed ratio between largest and smallest bins
            random_state: For reproducibility

        Returns:
            Balanced DataFrame
        """
        bin_counts = df[bin_col].value_counts()
        min_count = bin_counts.min()
        # If the smallest bin is too tiny, use a reasonable floor
        # to avoid collapsing the entire dataset
        effective_min = max(min_count, 50)
        max_allowed = int(effective_min * max_ratio)

        balanced_parts = []
        for bin_label, count in bin_counts.items():
            bin_df = df[df[bin_col] == bin_label]
            if count > max_allowed:
                bin_df = bin_df.sample(n=max_allowed, random_state=random_state)
                logger.info(
                    f"  Downsampled bin '{bin_label}': {count} → {max_allowed}"
                )
            balanced_parts.append(bin_df)

        result = pd.concat(balanced_parts, ignore_index=True)
        return result

    def build_stratified_dataset(
        self,
        df: pd.DataFrame,
        name: str,
        task: str,
        description: str = "",
        target_unit: str = "",
        balance_mw: bool = True,
        balance_tpsa: bool = False,
    ) -> StratifiedDataset:
        """
        Convert a preprocessed DataFrame into a StratifiedDataset.

        Optionally balances MW and TPSA distributions.
        """
        if balance_mw and "mw_bin" in df.columns:
            df = self.balance_bins(df, bin_col="mw_bin")
        if balance_tpsa and "tpsa_bin" in df.columns:
            df = self.balance_bins(df, bin_col="tpsa_bin")

        return StratifiedDataset(
            name=name,
            smiles=df["smiles"].tolist(),
            targets=df["target"].values.astype(np.float64),
            task=task,
            description=description,
            target_unit=target_unit,
            mw_bins=df["mw_bin"].values if "mw_bin" in df.columns else None,
            tpsa_bins=df["tpsa_bin"].values if "tpsa_bin" in df.columns else None,
            source_labels=df["source"].tolist() if "source" in df.columns else None,
        )

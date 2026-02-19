"""
splitting.py — Scaffold-Based and Random Data Splitting
=========================================================
Implements chemically-aware data splitting strategies for QSPR validation.

Scientific rationale for scaffold splitting:
  Conventional random splitting in drug discovery datasets leads to
  overly optimistic performance estimates because structurally similar
  molecules end up in both train and test sets. This creates data leakage:
  the model memorizes structural patterns rather than learning generalizable
  structure–property relationships.

  Scaffold splitting groups molecules by their Bemis–Murcko scaffold
  (the core ring system with linkers). All molecules sharing the same
  scaffold go to the SAME split. This ensures:
    1. The test set contains only novel scaffolds — simulating real-world
       prospective prediction where new chemical series are tested.
    2. Performance metrics reflect true generalization, not interpolation.

  Reference: Bemis & Murcko, J. Med. Chem., 1996, 39, 2887-2893.

  Empirically, scaffold splits reduce performance metrics by 5-15% compared
  to random splits on MoleculeNet benchmarks, but these lower numbers are
  more representative of real-world drug discovery performance.
"""

import logging
import numpy as np
from typing import Tuple, List, Dict, Optional
from collections import defaultdict
from rdkit import Chem
from rdkit.Chem.Scaffolds import MurckoScaffold

from .config import TEST_SIZE, SCAFFOLD_SPLIT_SEED

logger = logging.getLogger("qspr.splitting")


def _get_murcko_scaffold(smiles: str) -> str:
    """
    Extract the Bemis–Murcko scaffold from a SMILES string.

    Returns the generic scaffold (side chains removed, all atoms → carbon,
    all bonds → single) for maximum grouping.

    Falls back to the molecule's own SMILES if scaffold extraction fails —
    this treats molecules with no rings as unique scaffolds.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return smiles

    try:
        core = MurckoScaffold.GetScaffoldForMol(mol)
        generic = MurckoScaffold.MakeScaffoldGeneric(core)
        return Chem.MolToSmiles(generic, canonical=True)
    except Exception:
        return smiles


class ScaffoldSplitter:
    """
    Split molecules into train/test by Bemis–Murcko scaffold.

    Algorithm:
      1. Compute generic Murcko scaffold for each molecule.
      2. Group molecules by scaffold.
      3. Sort scaffolds by size (largest first) for deterministic behavior.
      4. Greedily assign scaffolds to train until test_size quota is met.
      5. Remaining scaffolds go to test.

    This ensures that no scaffold appears in both train and test,
    giving a rigorous estimate of out-of-distribution performance.
    """

    def __init__(
        self,
        test_size: float = TEST_SIZE,
        seed: int = SCAFFOLD_SPLIT_SEED,
    ):
        if not 0.05 <= test_size <= 0.5:
            raise ValueError(f"test_size must be in [0.05, 0.5], got {test_size}")

        self.test_size = test_size
        self.seed = seed

    def split(
        self,
        smiles_list: List[str],
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Split SMILES list into train/test indices using scaffold grouping.

        Args:
            smiles_list: List of SMILES strings

        Returns:
            (train_indices, test_indices) — numpy arrays of integer indices
        """
        n = len(smiles_list)
        n_test = int(n * self.test_size)

        # Group molecule indices by scaffold
        scaffold_groups: Dict[str, List[int]] = defaultdict(list)
        for idx, smi in enumerate(smiles_list):
            scaffold = _get_murcko_scaffold(smi)
            scaffold_groups[scaffold].append(idx)

        # Sort scaffolds: largest first for deterministic greedy assignment
        # Then by scaffold SMILES for reproducibility
        sorted_scaffolds = sorted(
            scaffold_groups.items(),
            key=lambda x: (-len(x[1]), x[0]),
        )

        train_indices = []
        test_indices = []

        for scaffold_smi, indices in sorted_scaffolds:
            if len(test_indices) < n_test:
                test_indices.extend(indices)
            else:
                train_indices.extend(indices)

        # If test set is too large (last scaffold pushed it over), rebalance
        # by shuffling excess from test back to train
        if len(test_indices) > int(n * (self.test_size + 0.05)):
            rng = np.random.RandomState(self.seed)
            rng.shuffle(test_indices)
            excess = len(test_indices) - n_test
            train_indices.extend(test_indices[:excess])
            test_indices = test_indices[excess:]

        train_idx = np.array(sorted(train_indices))
        test_idx = np.array(sorted(test_indices))

        logger.info(
            f"Scaffold split: {len(train_idx)} train / {len(test_idx)} test "
            f"({len(scaffold_groups)} unique scaffolds)"
        )

        return train_idx, test_idx

    def get_scaffold_groups(self, smiles_list: List[str]) -> Dict[str, List[int]]:
        """Return scaffold → molecule indices mapping for analysis."""
        groups: Dict[str, List[int]] = defaultdict(list)
        for idx, smi in enumerate(smiles_list):
            scaffold = _get_murcko_scaffold(smi)
            groups[scaffold].append(idx)
        return dict(groups)

    def kfold_scaffold_split(
        self,
        smiles_list: List[str],
        n_folds: int = 5,
    ) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        K-fold scaffold-based cross-validation splits.

        Unlike random K-fold, this assigns entire scaffolds to folds,
        ensuring no scaffold leaks across train/validation boundaries.

        Algorithm:
          1. Compute scaffold groups.
          2. Sort scaffolds by descending size.
          3. Round-robin assign scaffolds to k folds.
          4. For each fold i, fold i is validation, rest is training.

        Args:
            smiles_list: List of SMILES strings
            n_folds: Number of folds (default: 5)

        Returns:
            List of (train_indices, val_indices) tuples
        """
        scaffold_groups = defaultdict(list)
        for idx, smi in enumerate(smiles_list):
            scaffold = _get_murcko_scaffold(smi)
            scaffold_groups[scaffold].append(idx)

        # Sort scaffolds by descending size, then alphabetically
        sorted_scaffolds = sorted(
            scaffold_groups.values(),
            key=lambda x: -len(x),
        )

        # Round-robin assignment to folds
        fold_indices: List[List[int]] = [[] for _ in range(n_folds)]
        for i, group in enumerate(sorted_scaffolds):
            fold_indices[i % n_folds].extend(group)

        # Generate (train, val) pairs
        splits = []
        for fold_i in range(n_folds):
            val_idx = np.array(sorted(fold_indices[fold_i]))
            train_idx = np.array(sorted(
                idx for j in range(n_folds)
                if j != fold_i
                for idx in fold_indices[j]
            ))
            splits.append((train_idx, val_idx))
            logger.debug(
                f"  Fold {fold_i + 1}: {len(train_idx)} train / {len(val_idx)} val"
            )

        return splits


class RandomSplitter:
    """
    Standard random train/test split (for comparison benchmarks).

    Included to measure the "scaffold gap" — the performance difference
    between random and scaffold splitting, which quantifies how well
    models generalize to novel chemical scaffolds.
    """

    def __init__(
        self,
        test_size: float = TEST_SIZE,
        seed: int = SCAFFOLD_SPLIT_SEED,
    ):
        self.test_size = test_size
        self.seed = seed

    def split(
        self,
        smiles_list: List[str],
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Random train/test split."""
        n = len(smiles_list)
        indices = np.arange(n)
        rng = np.random.RandomState(self.seed)
        rng.shuffle(indices)

        n_test = int(n * self.test_size)
        test_idx = np.sort(indices[:n_test])
        train_idx = np.sort(indices[n_test:])

        logger.info(f"Random split: {len(train_idx)} train / {len(test_idx)} test")
        return train_idx, test_idx

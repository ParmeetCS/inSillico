"""
similarity_engine.py — Morgan Fingerprint Similarity-Based Target Prediction
==============================================================================
Predicts protein targets using the Similarity Ensemble Approach (SEA):
    Given a query molecule, compute Tanimoto similarity of its Morgan
    fingerprint against all reference compounds in the local database,
    then predict targets based on similarity to known active ligands.

Dataset:  data/drug_targets.csv
          ~120 approved drugs × ~200 validated target interactions
          Sources: ChEMBL 34, DrugBank 5.x, published pharmacology literature

Method:
    1. At startup, load reference database (drug SMILES → targets with pChEMBL)
    2. Compute Morgan fingerprints (ECFP4: radius=2, nBits=2048) for all reference compounds
    3. Group references by target gene symbol
    4. For a query compound:
       a. Compute its Morgan FP (same params)
       b. For each target: max Tanimoto similarity to any known active compound
       c. Convert similarity to probability via sigmoid: p = 1/(1 + exp(-k*(Tc - Tc0)))
       d. Weight by binding potency: p_final = p_similarity × (pchembl / 10)
       e. Return targets above threshold

References:
    Keiser MJ, Roth BL, Armbruster BN, et al.
    "Relating protein pharmacology by ligand chemistry."
    Nature Biotechnology 25, 197–206 (2007).
    DOI: 10.1038/nbt1284

    Rogers D, Hahn M.
    "Extended-Connectivity Fingerprints."
    Journal of Chemical Information and Modeling 50(5), 742–754 (2010).
    DOI: 10.1021/ci100050t

Fingerprint Parameters:
    Type:    Morgan / ECFP4 (Extended-Connectivity Fingerprints, diameter 4)
    Radius:  2 (equates to ECFP4 diameter)
    Bits:    2048
    These match ChEMBL's internal fingerprint representation.

Similarity Metric:
    Tanimoto coefficient: Tc(A,B) = |A ∩ B| / |A ∪ B|
    Range: [0, 1], where 1 = identical fingerprints
    Threshold: Tc ≥ 0.3 for prediction (conservative)
    Literature standard: Tc ≥ 0.7 for "similar" compounds (Maggiora et al., 2014)
"""

import csv
import logging
import math
import os
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit import DataStructs

logger = logging.getLogger("insilico-ml.network_pharmacology")

# ─── Fingerprint Configuration ───
FP_RADIUS = 2       # Morgan radius (ECFP4)
FP_NBITS = 2048     # bit vector length

# ─── Similarity → Probability Mapping (Sigmoid) ───
# p(target | Tc) = 1 / (1 + exp(-SIGMOID_K * (Tc - SIGMOID_MID)))
SIGMOID_K = 12.0     # steepness: controls how sharply probability transitions
SIGMOID_MID = 0.40   # midpoint: Tc at which probability = 0.50

# At these values:
#   Tc=0.70 → p=0.97 (very high confidence)
#   Tc=0.55 → p=0.86
#   Tc=0.40 → p=0.50 (moderate)
#   Tc=0.30 → p=0.23 (low)
#   Tc=0.20 → p=0.08 (very low)

MIN_SIMILARITY = 0.25   # minimum Tc to consider a prediction
MIN_PROBABILITY = 0.10  # minimum final probability to report

# ─── Reference Database ───
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
REFERENCE_DB_PATH = os.path.join(DATA_DIR, "drug_targets.csv")


class SimilarityEngine:
    """
    Morgan fingerprint similarity-based target prediction engine.

    Loads a reference database of known drug-target interactions,
    computes Morgan FPs at startup, and predicts targets for query
    compounds using Tanimoto similarity.
    """

    def __init__(self):
        self._reference_fps: Dict[str, List[Tuple[Any, float, str]]] = {}
        # gene_symbol → [(fingerprint, pchembl_value, drug_name), ...]

        self._drug_count = 0
        self._target_count = 0
        self._interaction_count = 0
        self._loaded = False

        self._target_metadata: Dict[str, Dict[str, str]] = {}
        # gene_symbol → {target_name, uniprot_id, target_class}

    def load(self) -> bool:
        """Load reference database and compute fingerprints."""
        if self._loaded:
            return True

        if not os.path.exists(REFERENCE_DB_PATH):
            logger.warning(f"Reference DB not found: {REFERENCE_DB_PATH}")
            return False

        try:
            drug_names = set()
            gene_names = set()
            fp_cache: Dict[str, Any] = {}  # smiles → fingerprint (avoid recomputing)

            with open(REFERENCE_DB_PATH, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)

                for row in reader:
                    smiles = row.get("smiles", "").strip()
                    gene = row.get("gene_symbol", "").strip().upper()
                    pchembl = float(row.get("pchembl_value", "5.0"))
                    drug_name = row.get("drug_name", "")

                    if not smiles or not gene:
                        continue

                    # Compute fingerprint (cached per SMILES)
                    if smiles not in fp_cache:
                        mol = Chem.MolFromSmiles(smiles)
                        if mol is None:
                            logger.debug(f"Invalid SMILES in reference DB: {smiles[:30]}...")
                            fp_cache[smiles] = None
                            continue
                        fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_NBITS)
                        fp_cache[smiles] = fp
                    else:
                        fp = fp_cache[smiles]

                    if fp is None:
                        continue

                    # Store reference compound for this target
                    if gene not in self._reference_fps:
                        self._reference_fps[gene] = []

                    self._reference_fps[gene].append((fp, pchembl, drug_name))
                    drug_names.add(drug_name)
                    gene_names.add(gene)
                    self._interaction_count += 1

                    # Store target metadata
                    if gene not in self._target_metadata:
                        self._target_metadata[gene] = {
                            "target_name": row.get("target_name", ""),
                            "uniprot_id": row.get("uniprot_id", ""),
                            "target_class": row.get("target_class", ""),
                        }

            self._drug_count = len(drug_names)
            self._target_count = len(gene_names)
            self._loaded = True

            logger.info(
                f"Similarity engine loaded: {self._drug_count} drugs, "
                f"{self._target_count} targets, {self._interaction_count} interactions"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to load reference DB: {e}")
            return False

    def predict(self, smiles: str, top_k: int = 20) -> List[Dict[str, Any]]:
        """
        Predict protein targets for a query SMILES.

        Mechanism:
          1. Compute Morgan FP for the query compound
          2. For each target in the reference DB:
             - Find the most similar known active compound (max Tanimoto)
             - Convert Tc → probability via sigmoid function
             - Weight by binding potency: p × (pchembl / 10)
          3. Return targets above threshold, sorted by probability

        Returns:
            List of target predictions with confidence scores and evidence.
        """
        if not self._loaded:
            if not self.load():
                return []

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return []

        query_fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_NBITS)

        predictions = []

        for gene, ref_compounds in self._reference_fps.items():
            best_tc = 0.0
            best_pchembl = 0.0
            best_drug = ""

            for ref_fp, pchembl, drug_name in ref_compounds:
                tc = DataStructs.TanimotoSimilarity(query_fp, ref_fp)
                if tc > best_tc:
                    best_tc = tc
                    best_pchembl = pchembl
                    best_drug = drug_name

            if best_tc < MIN_SIMILARITY:
                continue

            # Sigmoid: similarity → probability
            p_similarity = 1.0 / (1.0 + math.exp(-SIGMOID_K * (best_tc - SIGMOID_MID)))

            # Weight by binding potency (pChEMBL / 10, where 10 = 100 pM)
            potency_weight = min(best_pchembl / 10.0, 1.0)
            probability = round(min(p_similarity * potency_weight, 0.99), 3)

            if probability < MIN_PROBABILITY:
                continue

            meta = self._target_metadata.get(gene, {})

            predictions.append({
                "gene_name": gene,
                "target_name": meta.get("target_name", gene),
                "uniprot_id": meta.get("uniprot_id", ""),
                "target_class": meta.get("target_class", ""),
                "probability": probability,
                "source": "fingerprint_similarity",
                "evidence": {
                    "method": "Morgan FP Tanimoto (ECFP4, r=2, 2048 bits)",
                    "tanimoto_coefficient": round(best_tc, 3),
                    "most_similar_drug": best_drug,
                    "reference_pchembl": round(best_pchembl, 2),
                    "dataset": "ChEMBL/DrugBank approved drugs",
                    "dataset_size": f"{self._drug_count} drugs, {self._interaction_count} interactions",
                },
            })

        # Sort by probability descending
        predictions.sort(key=lambda x: x["probability"], reverse=True)
        return predictions[:top_k]

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def stats(self) -> Dict[str, int]:
        return {
            "drugs": self._drug_count,
            "targets": self._target_count,
            "interactions": self._interaction_count,
        }


# ─── Module-level singleton ───
_engine: Optional[SimilarityEngine] = None


def get_engine() -> SimilarityEngine:
    """Get or create the singleton similarity engine."""
    global _engine
    if _engine is None:
        _engine = SimilarityEngine()
        _engine.load()
    return _engine


def predict_targets_similarity(smiles: str, top_k: int = 20) -> List[Dict[str, Any]]:
    """
    Predict targets using Morgan FP similarity against reference database.

    This is the public API for the similarity engine.
    Returns empty list if reference DB is not available.
    """
    engine = get_engine()
    if not engine.is_loaded:
        return []
    return engine.predict(smiles, top_k)

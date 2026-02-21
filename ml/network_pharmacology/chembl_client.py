"""
chembl_client.py — ChEMBL REST API Client for Real Target Prediction
=====================================================================
Queries the European Bioinformatics Institute (EBI) ChEMBL database
for real compound-target interaction data.

Data Source:  ChEMBL 34 (https://www.ebi.ac.uk/chembl/)
API Docs:     https://chembl.gitbook.io/chembl-interface-documentation/web-services/chembl-data-web-services
License:      Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)

Mechanism:
  1. Similarity Search:  Find compounds in ChEMBL with Tanimoto similarity ≥ 70%
     to the query SMILES (Morgan fingerprints, radius 2, 2048 bits — same as
     ChEMBL's internal representation).

  2. Activity Lookup:  For each similar compound, fetch bioactivity records
     (IC50, Ki, Kd, EC50) against SINGLE PROTEIN targets with pChEMBL ≥ 5.0
     (i.e., activity ≤ 10 µM — the standard medicinal chemistry threshold).

  3. Target Scoring:  For each target, compute a confidence score:
        score = max_i( tanimoto_i × pchembl_i / 10 )
     This weights both structural similarity AND binding potency.

  4. Returns targets ranked by confidence score.

References:
  - Gaulton A. et al. "The ChEMBL database in 2017." Nucleic Acids Res. 2017.
  - Mendez D. et al. "ChEMBL: towards direct deposition of bioassay data."
    Nucleic Acids Res. 2019.
"""

import logging
import time
import requests
from typing import List, Dict, Any, Optional
from collections import defaultdict

logger = logging.getLogger("insilico-ml.network_pharmacology")

# ─── ChEMBL REST API Configuration ───
CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data"
API_TIMEOUT = 15  # seconds per request
MAX_SIMILAR = 25  # max similar compounds to retrieve
MIN_SIMILARITY = 70  # Tanimoto threshold (%)
MIN_PCHEMBL = 5.0  # -log10(M), i.e., ≤ 10 µM activity
RATE_LIMIT_DELAY = 0.3  # seconds between API calls (polite client)


def _chembl_similarity_search(smiles: str, threshold: int = MIN_SIMILARITY
                               ) -> Optional[List[Dict[str, Any]]]:
    """
    ChEMBL Similarity Search: find compounds with Tanimoto ≥ threshold.

    Endpoint: GET /similarity/{smiles}/{threshold}.json
    Returns list of similar molecules with ChEMBL IDs and similarity scores.
    """
    try:
        url = f"{CHEMBL_BASE}/similarity/{smiles}/{threshold}.json"
        params = {"limit": MAX_SIMILAR}

        resp = requests.get(url, params=params, timeout=API_TIMEOUT)

        if resp.status_code == 404:
            logger.debug(f"ChEMBL: no results for SMILES {smiles[:30]}...")
            return []

        if resp.status_code == 400:
            logger.warning(f"ChEMBL: invalid SMILES rejected: {smiles[:30]}...")
            return None

        if resp.status_code != 200:
            logger.warning(f"ChEMBL similarity search HTTP {resp.status_code}")
            return None

        data = resp.json()
        molecules = data.get("molecules", [])

        results = []
        for mol in molecules:
            chembl_id = mol.get("molecule_chembl_id", "")
            similarity = mol.get("similarity", 0)
            pref_name = mol.get("pref_name", "")

            if chembl_id and similarity:
                results.append({
                    "molecule_chembl_id": chembl_id,
                    "similarity": float(similarity) / 100.0,  # normalize to 0-1
                    "pref_name": pref_name or chembl_id,
                })

        logger.info(f"ChEMBL similarity: found {len(results)} compounds "
                     f"(Tc ≥ {threshold}%) for {smiles[:30]}...")
        return results

    except requests.exceptions.Timeout:
        logger.warning("ChEMBL similarity search timed out")
        return None
    except Exception as e:
        logger.debug(f"ChEMBL similarity search failed: {e}")
        return None


def _chembl_get_activities(chembl_ids: List[str],
                           min_pchembl: float = MIN_PCHEMBL
                           ) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch bioactivity records for a batch of ChEMBL compound IDs.

    Endpoint: GET /activity.json?molecule_chembl_id__in=...
    Filters: target_type=SINGLE PROTEIN, pchembl_value ≥ min_pchembl
    """
    if not chembl_ids:
        return []

    try:
        # ChEMBL API supports __in lookups for batch queries
        ids_param = ",".join(chembl_ids[:25])  # limit batch size

        url = f"{CHEMBL_BASE}/activity.json"
        params = {
            "molecule_chembl_id__in": ids_param,
            "target_type": "SINGLE PROTEIN",
            "pchembl_value__gte": min_pchembl,
            "target_organism": "Homo sapiens",
            "limit": 500,
        }

        resp = requests.get(url, params=params, timeout=API_TIMEOUT)

        if resp.status_code != 200:
            logger.warning(f"ChEMBL activity lookup HTTP {resp.status_code}")
            return None

        data = resp.json()
        activities = data.get("activities", [])

        results = []
        for act in activities:
            target_chembl = act.get("target_chembl_id", "")
            pchembl = act.get("pchembl_value")
            target_pref = act.get("target_pref_name", "")
            target_organism = act.get("target_organism", "")

            if target_chembl and pchembl and target_organism == "Homo sapiens":
                results.append({
                    "molecule_chembl_id": act.get("molecule_chembl_id", ""),
                    "target_chembl_id": target_chembl,
                    "target_pref_name": target_pref,
                    "pchembl_value": float(pchembl),
                    "activity_type": act.get("standard_type", ""),
                    "assay_type": act.get("assay_type", ""),
                })

        logger.info(f"ChEMBL activities: {len(results)} records "
                     f"for {len(chembl_ids)} compounds")
        return results

    except requests.exceptions.Timeout:
        logger.warning("ChEMBL activity lookup timed out")
        return None
    except Exception as e:
        logger.debug(f"ChEMBL activity lookup failed: {e}")
        return None


def _chembl_resolve_targets(target_chembl_ids: List[str]
                             ) -> Dict[str, Dict[str, str]]:
    """
    Resolve ChEMBL target IDs to gene symbols and UniProt IDs.

    Uses batch endpoint: GET /target.json?target_chembl_id__in=...
    Falls back to individual lookups if batch fails.
    """
    resolved = {}
    unique_ids = list(set(target_chembl_ids))

    if not unique_ids:
        return resolved

    # ── Try batch resolution first (single API call) ──
    try:
        ids_param = ",".join(unique_ids)
        url = f"{CHEMBL_BASE}/target.json"
        params = {
            "target_chembl_id__in": ids_param,
            "limit": 100,
        }
        resp = requests.get(url, params=params, timeout=API_TIMEOUT)

        if resp.status_code == 200:
            data = resp.json()
            targets = data.get("targets", [])

            for tgt in targets:
                tid = tgt.get("target_chembl_id", "")
                components = tgt.get("target_components", [])
                for comp in components:
                    accession = comp.get("accession", "")
                    synonyms = comp.get("target_component_synonyms", [])
                    gene_symbol = ""
                    for syn in synonyms:
                        if syn.get("syn_type") == "GENE_SYMBOL":
                            gene_symbol = syn.get("component_synonym", "")
                            break
                    if gene_symbol and accession:
                        resolved[tid] = {
                            "gene_symbol": gene_symbol.upper(),
                            "uniprot_id": accession,
                            "target_name": tgt.get("pref_name", ""),
                            "target_type": tgt.get("target_type", ""),
                        }
                        break

            if resolved:
                return resolved

    except Exception as e:
        logger.debug(f"ChEMBL batch target resolution failed: {e}")

    # ── Fallback: individual lookups ──
    for tid in unique_ids[:8]:  # cap at 8 to avoid excessive API calls
        if tid in resolved:
            continue
        try:
            time.sleep(RATE_LIMIT_DELAY)
            url = f"{CHEMBL_BASE}/target/{tid}.json"
            resp = requests.get(url, timeout=API_TIMEOUT)
            if resp.status_code != 200:
                continue
            data = resp.json()
            components = data.get("target_components", [])
            for comp in components:
                accession = comp.get("accession", "")
                synonyms = comp.get("target_component_synonyms", [])
                gene_symbol = ""
                for syn in synonyms:
                    if syn.get("syn_type") == "GENE_SYMBOL":
                        gene_symbol = syn.get("component_synonym", "")
                        break
                if gene_symbol and accession:
                    resolved[tid] = {
                        "gene_symbol": gene_symbol.upper(),
                        "uniprot_id": accession,
                        "target_name": data.get("pref_name", ""),
                        "target_type": data.get("target_type", ""),
                    }
                    break
        except Exception as e:
            logger.debug(f"ChEMBL target resolution failed for {tid}: {e}")
            continue

    return resolved


def predict_targets_chembl(smiles: str, top_k: int = 20
                            ) -> Optional[List[Dict[str, Any]]]:
    """
    Full ChEMBL-based target prediction pipeline.

    Mechanism (Similarity Ensemble Approach — SEA-inspired):
    ────────────────────────────────────────────────────────
    1. Find structurally similar compounds in ChEMBL (Tanimoto ≥ 70%)
    2. Retrieve bioactivity records for those compounds (pChEMBL ≥ 5.0)
    3. For each target, compute confidence:
         confidence = max(similarity × pchembl / 10)
       across all similar compounds active against that target.
    4. Resolve ChEMBL target IDs to gene symbols / UniProt.
    5. Return ranked list.

    References:
      Keiser MJ et al. "Relating protein pharmacology by ligand chemistry."
      Nature Biotechnology 25, 197–206 (2007). [SEA method]

    Returns None on API failure (caller should fall back to local methods).
    """
    # Step 1: Similarity search
    similar = _chembl_similarity_search(smiles)
    if similar is None:
        return None  # API failure → fallback
    if len(similar) == 0:
        return []  # no similar compounds

    # Step 2: Batch activity lookup
    time.sleep(RATE_LIMIT_DELAY)
    chembl_ids = [m["molecule_chembl_id"] for m in similar]
    similarity_map = {m["molecule_chembl_id"]: m["similarity"] for m in similar}

    activities = _chembl_get_activities(chembl_ids)
    if activities is None:
        return None  # API failure → fallback
    if len(activities) == 0:
        return []  # similar compounds have no human protein targets

    # Step 3: Score targets
    #   For each target: score = max across compounds of (Tc × pChEMBL / 10)
    target_scores: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "best_score": 0.0,
        "best_pchembl": 0.0,
        "best_similarity": 0.0,
        "compound_count": 0,
        "target_chembl_id": "",
        "target_name": "",
    })

    for act in activities:
        mol_id = act["molecule_chembl_id"]
        target_id = act["target_chembl_id"]
        pchembl = act["pchembl_value"]
        tc = similarity_map.get(mol_id, 0.7)

        score = tc * (pchembl / 10.0)

        if score > target_scores[target_id]["best_score"]:
            target_scores[target_id]["best_score"] = score
            target_scores[target_id]["best_pchembl"] = pchembl
            target_scores[target_id]["best_similarity"] = tc
            target_scores[target_id]["target_chembl_id"] = target_id
            target_scores[target_id]["target_name"] = act.get("target_pref_name", "")
        target_scores[target_id]["compound_count"] += 1

    if not target_scores:
        return []

    # Step 4: Resolve target IDs to gene symbols (top targets only)
    sorted_targets = sorted(target_scores.items(),
                             key=lambda x: x[1]["best_score"], reverse=True)
    top_target_ids = [tid for tid, _ in sorted_targets[:top_k * 2]]

    time.sleep(RATE_LIMIT_DELAY)
    resolved = _chembl_resolve_targets(top_target_ids[:15])  # limit API calls

    # Step 5: Build result list
    results = []
    for target_id, info in sorted_targets:
        if target_id not in resolved:
            continue

        gene_info = resolved[target_id]
        probability = min(round(info["best_score"], 3), 0.99)

        results.append({
            "gene_name": gene_info["gene_symbol"],
            "target_name": gene_info["target_name"] or info["target_name"],
            "uniprot_id": gene_info["uniprot_id"],
            "target_class": gene_info.get("target_type", "Unknown"),
            "probability": probability,
            "source": "chembl_similarity",
            "evidence": {
                "chembl_target_id": target_id,
                "best_tanimoto": round(info["best_similarity"], 3),
                "best_pchembl": round(info["best_pchembl"], 2),
                "supporting_compounds": info["compound_count"],
                "method": "SEA-inspired (Tanimoto similarity × bioactivity)",
            },
        })

        if len(results) >= top_k:
            break

    logger.info(f"ChEMBL prediction: {len(results)} targets from "
                 f"{len(similar)} similar compounds")
    return results

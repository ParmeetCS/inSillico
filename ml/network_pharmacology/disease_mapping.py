"""
disease_mapping.py — Gene-Disease Association Mapping
=====================================================
Given a list of gene symbols, maps them to associated diseases using:
  1. Open Targets Platform GraphQL API (primary — free, no key required)
  2. Local curated gene-disease database (offline fallback)

Returns disease associations sorted by association score, grouped by
therapeutic area.
"""

import logging
import requests
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict

logger = logging.getLogger("insilico-ml.network_pharmacology")

API_TIMEOUT = 12  # seconds

# ═══════════════════════════════════════════════════════════════
#  Open Targets Platform GraphQL API
# ═══════════════════════════════════════════════════════════════

OPEN_TARGETS_API = "https://api.platform.opentargets.org/api/v4/graphql"


def _query_open_targets(genes: List[str], top_per_gene: int = 5
                        ) -> Optional[List[Dict[str, Any]]]:
    """
    Query Open Targets Platform for disease associations.
    Uses the GraphQL endpoint (free, no API key required).
    """
    all_results = []

    for gene in genes:
        try:
            # First: resolve gene symbol to Ensembl ID via search
            search_query = {
                "query": """
                    query SearchGene($q: String!) {
                        search(queryString: $q, entityNames: ["target"], page: {index: 0, size: 1}) {
                            hits {
                                id
                                name
                                entity
                            }
                        }
                    }
                """,
                "variables": {"q": gene}
            }

            resp = requests.post(OPEN_TARGETS_API, json=search_query, timeout=API_TIMEOUT)
            if resp.status_code != 200:
                continue

            search_data = resp.json().get("data", {}).get("search", {}).get("hits", [])
            if not search_data:
                continue

            target_id = search_data[0]["id"]

            # Second: get disease associations for this target
            assoc_query = {
                "query": """
                    query TargetDiseases($id: String!) {
                        target(ensemblId: $id) {
                            id
                            approvedSymbol
                            associatedDiseases(page: {index: 0, size: 10}) {
                                rows {
                                    disease {
                                        id
                                        name
                                        therapeuticAreas {
                                            id
                                            name
                                        }
                                    }
                                    score
                                    datasourceScores {
                                        id
                                        score
                                    }
                                }
                            }
                        }
                    }
                """,
                "variables": {"id": target_id}
            }

            resp2 = requests.post(OPEN_TARGETS_API, json=assoc_query, timeout=API_TIMEOUT)
            if resp2.status_code != 200:
                continue

            target_data = resp2.json().get("data", {}).get("target", {})
            if not target_data:
                continue

            rows = target_data.get("associatedDiseases", {}).get("rows", [])

            for row in rows[:top_per_gene]:
                disease = row.get("disease", {})
                areas = disease.get("therapeuticAreas", [])
                area_name = areas[0]["name"] if areas else "Unknown"

                all_results.append({
                    "disease_id": disease.get("id", ""),
                    "disease_name": disease.get("name", ""),
                    "score": round(row.get("score", 0), 4),
                    "therapeutic_area": area_name,
                    "associated_gene": gene,
                    "source": "open_targets",
                })

        except Exception as e:
            logger.debug(f"Open Targets query failed for {gene}: {e}")
            continue

    return all_results if all_results else None


# ═══════════════════════════════════════════════════════════════
#  Local Curated Gene ↔ Disease Associations
# ═══════════════════════════════════════════════════════════════

# Based on OMIM, ClinVar, DisGeNET, and clinical evidence
CURATED_DISEASES: List[Dict[str, Any]] = [
    # ── Cancers ──
    {"disease_id": "EFO_0000311", "disease_name": "Cancer", "therapeutic_area": "Oncology",
     "genes": {"EGFR", "BRAF", "MAPK1", "SRC", "ABL1", "CDK2", "CDK4", "MMP9", "ESR1", "AR", "PTGS2", "TUBB", "TUBA1A"},
     "base_score": 0.85},
    {"disease_id": "EFO_0000305", "disease_name": "Breast Cancer", "therapeutic_area": "Oncology",
     "genes": {"ESR1", "EGFR", "CDK4", "CDK2", "SRC", "AR"},
     "base_score": 0.90},
    {"disease_id": "EFO_0001071", "disease_name": "Non-Small Cell Lung Cancer", "therapeutic_area": "Oncology",
     "genes": {"EGFR", "BRAF", "MAPK1", "ALK", "SRC"},
     "base_score": 0.92},
    {"disease_id": "EFO_0000756", "disease_name": "Melanoma", "therapeutic_area": "Oncology",
     "genes": {"BRAF", "MAPK1", "CDK4", "SRC"},
     "base_score": 0.88},
    {"disease_id": "EFO_0000339", "disease_name": "Chronic Myeloid Leukemia", "therapeutic_area": "Oncology",
     "genes": {"ABL1", "SRC", "MAPK1"},
     "base_score": 0.95},
    {"disease_id": "EFO_0002626", "disease_name": "Prostate Cancer", "therapeutic_area": "Oncology",
     "genes": {"AR", "SRC", "CDK2", "CDK4"},
     "base_score": 0.87},

    # ── Inflammatory / Autoimmune ──
    {"disease_id": "EFO_0003767", "disease_name": "Rheumatoid Arthritis", "therapeutic_area": "Immune System",
     "genes": {"PTGS1", "PTGS2", "MMP9", "MAPK1"},
     "base_score": 0.82},
    {"disease_id": "EFO_0000270", "disease_name": "Asthma", "therapeutic_area": "Respiratory",
     "genes": {"PTGS2", "PDE4A", "ADORA2A", "MAPK1"},
     "base_score": 0.75},
    {"disease_id": "EFO_0003060", "disease_name": "Inflammatory Bowel Disease", "therapeutic_area": "Immune System",
     "genes": {"PTGS2", "MMP9", "MAPK1", "NQO1"},
     "base_score": 0.70},

    # ── Neurological ──
    {"disease_id": "EFO_0000289", "disease_name": "Schizophrenia", "therapeutic_area": "Psychiatry",
     "genes": {"DRD2", "HTR2A", "HTR2C", "DRD1", "ADORA2A"},
     "base_score": 0.88},
    {"disease_id": "EFO_0003761", "disease_name": "Major Depressive Disorder", "therapeutic_area": "Psychiatry",
     "genes": {"HTR1A", "HTR2A", "HTR2C", "DRD2"},
     "base_score": 0.85},
    {"disease_id": "EFO_0000249", "disease_name": "Alzheimer Disease", "therapeutic_area": "Neurology",
     "genes": {"ACHE", "BCHE", "PTGS2", "MAPK1", "EGFR"},
     "base_score": 0.80},
    {"disease_id": "EFO_0002508", "disease_name": "Parkinson Disease", "therapeutic_area": "Neurology",
     "genes": {"DRD1", "DRD2", "ADORA2A", "SRC"},
     "base_score": 0.78},
    {"disease_id": "EFO_0000692", "disease_name": "Epilepsy", "therapeutic_area": "Neurology",
     "genes": {"SCN5A", "CA2", "HTR2C"},
     "base_score": 0.65},
    {"disease_id": "EFO_0001360", "disease_name": "Migraine", "therapeutic_area": "Neurology",
     "genes": {"HTR1A", "HTR2A", "PTGS2", "ADRA1A"},
     "base_score": 0.60},

    # ── Cardiovascular ──
    {"disease_id": "EFO_0000537", "disease_name": "Hypertension", "therapeutic_area": "Cardiovascular",
     "genes": {"ACE", "ADRA1A", "PDE5A", "SCN5A"},
     "base_score": 0.85},
    {"disease_id": "EFO_0001645", "disease_name": "Coronary Heart Disease", "therapeutic_area": "Cardiovascular",
     "genes": {"HMGCR", "PTGS1", "PTGS2", "ACE", "MMP9"},
     "base_score": 0.82},
    {"disease_id": "EFO_0005537", "disease_name": "Heart Failure", "therapeutic_area": "Cardiovascular",
     "genes": {"ACE", "PDE5A", "SCN5A", "ADRA1A"},
     "base_score": 0.75},

    # ── Metabolic ──
    {"disease_id": "EFO_0000400", "disease_name": "Diabetes Mellitus", "therapeutic_area": "Metabolic",
     "genes": {"AKR1B1", "HMGCR", "MAPK1", "PDE4A", "PPARG", "CYP2E1"},
     "base_score": 0.72},
    {"disease_id": "EFO_0004518", "disease_name": "Hypercholesterolemia", "therapeutic_area": "Metabolic",
     "genes": {"HMGCR", "CYP3A4", "ABCB1"},
     "base_score": 0.90},
    {"disease_id": "EFO_0004265", "disease_name": "Non-Alcoholic Fatty Liver Disease", "therapeutic_area": "Hepatic",
     "genes": {"CYP2E1", "CYP3A4", "CYP1A2", "UGT1A1", "PPARG", "ALB"},
     "base_score": 0.78},
    {"disease_id": "EFO_0009718", "disease_name": "Drug-Induced Liver Injury", "therapeutic_area": "Hepatic",
     "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "CYP2E1", "CYP2C9", "CYP2C19", "UGT1A1", "ABCB1", "NQO1"},
     "base_score": 0.85},
    {"disease_id": "EFO_0005208", "disease_name": "Gilbert Syndrome", "therapeutic_area": "Hepatic",
     "genes": {"UGT1A1"},
     "base_score": 0.92},
    {"disease_id": "EFO_0004190", "disease_name": "Drug Interaction Risk", "therapeutic_area": "Pharmacogenomics",
     "genes": {"CYP3A4", "CYP2D6", "CYP2C9", "CYP2C19", "CYP1A2", "CYP2E1", "ABCB1", "UGT1A1", "SULT1A1"},
     "base_score": 0.80},
    {"disease_id": "EFO_0000270b", "disease_name": "Asthma (Leukotriene-Driven)", "therapeutic_area": "Respiratory",
     "genes": {"ALOX5", "ALOX15", "PTGS2"},
     "base_score": 0.82},
    {"disease_id": "EFO_0009270", "disease_name": "Oxidative Stress Disorders", "therapeutic_area": "Metabolic",
     "genes": {"NQO1", "AHR", "CYP1A2", "CYP2E1", "ALOX5"},
     "base_score": 0.68},

    # ── Pain ──
    {"disease_id": "EFO_0003843", "disease_name": "Pain", "therapeutic_area": "Neurology",
     "genes": {"PTGS1", "PTGS2", "SCN5A", "HTR1A"},
     "base_score": 0.80},

    # ── Erectile Dysfunction (PDE5) ──
    {"disease_id": "EFO_0004243", "disease_name": "Erectile Dysfunction", "therapeutic_area": "Reproductive",
     "genes": {"PDE5A"},
     "base_score": 0.95},

    # ── Glaucoma (CA inhibitors) ──
    {"disease_id": "EFO_0000516", "disease_name": "Glaucoma", "therapeutic_area": "Ophthalmology",
     "genes": {"CA2", "CA9"},
     "base_score": 0.80},
]


def _local_disease_mapping(genes: List[str]) -> List[Dict[str, Any]]:
    """Map genes to diseases using curated associations."""
    query_set = set(g.upper() for g in genes)
    results = []

    for disease in CURATED_DISEASES:
        disease_genes = set(g.upper() for g in disease["genes"])
        overlap = query_set.intersection(disease_genes)

        if not overlap:
            continue

        # Score modulated by fraction of disease genes covered
        coverage = len(overlap) / len(disease_genes)
        score = round(min(disease["base_score"] * (0.5 + 0.5 * coverage), 1.0), 4)

        results.append({
            "disease_id": disease["disease_id"],
            "disease_name": disease["disease_name"],
            "score": score,
            "therapeutic_area": disease["therapeutic_area"],
            "associated_genes": sorted(overlap),
            "gene_count": len(overlap),
            "source": "curated_local",
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ═══════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════

def map_diseases(genes: List[str], top_k: int = 25) -> Dict[str, Any]:
    """
    Map a gene list to associated diseases.
    
    Args:
        genes: List of gene symbols
        top_k: Maximum diseases to return
    
    Returns:
        {
            "query_genes": [...],
            "diseases": [{disease_id, disease_name, score, therapeutic_area, associated_genes}],
            "disease_count": int,
            "therapeutic_areas": {area_name: count},
            "source": "open_targets" | "curated_local",
        }
    """
    if not genes:
        return {"query_genes": [], "diseases": [], "disease_count": 0,
                "therapeutic_areas": {}, "source": "none"}

    gene_list = list(dict.fromkeys(g.upper() for g in genes))

    # Try Open Targets first
    ot_results = _query_open_targets(gene_list)
    source = "open_targets"

    if ot_results and len(ot_results) > 0:
        diseases = ot_results
    else:
        diseases = _local_disease_mapping(gene_list)
        source = "curated_local"

    # Deduplicate by disease_id — merge associated genes
    disease_map: Dict[str, Dict[str, Any]] = {}
    for d in diseases:
        did = d["disease_id"]
        if did not in disease_map:
            disease_map[did] = {
                "disease_id": did,
                "disease_name": d["disease_name"],
                "score": d["score"],
                "therapeutic_area": d["therapeutic_area"],
                "associated_genes": set(),
                "source": d.get("source", source),
            }
        else:
            disease_map[did]["score"] = max(disease_map[did]["score"], d["score"])

        if "associated_genes" in d:
            if isinstance(d["associated_genes"], list):
                disease_map[did]["associated_genes"].update(d["associated_genes"])
            elif isinstance(d["associated_genes"], set):
                disease_map[did]["associated_genes"].update(d["associated_genes"])
        if "associated_gene" in d:
            disease_map[did]["associated_genes"].add(d["associated_gene"])

    result_list = []
    for d in disease_map.values():
        d["associated_genes"] = sorted(d["associated_genes"])
        d["gene_count"] = len(d["associated_genes"])
        result_list.append(d)

    result_list.sort(key=lambda x: x["score"], reverse=True)
    result_list = result_list[:top_k]

    # Therapeutic area summary
    area_counts: Dict[str, int] = defaultdict(int)
    for d in result_list:
        area_counts[d["therapeutic_area"]] += 1

    area_counts = dict(sorted(area_counts.items(), key=lambda x: x[1], reverse=True))

    return {
        "query_genes": gene_list,
        "diseases": result_list,
        "disease_count": len(result_list),
        "therapeutic_areas": area_counts,
        "source": source,
    }

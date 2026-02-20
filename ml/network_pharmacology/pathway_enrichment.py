"""
pathway_enrichment.py — Pathway & Functional Enrichment Analysis
================================================================
Given a list of gene symbols (from target prediction + PPI expansion),
performs pathway enrichment analysis using:
  1. KEGG REST API (free, no key)
  2. Reactome Content Service API (free, no key)
  3. Local curated pathway database (offline fallback)

Returns enriched pathways sorted by statistical significance (p-value)
with FDR correction (Benjamini-Hochberg).
"""

import logging
import math
import requests
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict

logger = logging.getLogger("insilico-ml.network_pharmacology")

API_TIMEOUT = 12  # seconds

# ═══════════════════════════════════════════════════════════════
#  Statistical helpers (no scipy dependency)
# ═══════════════════════════════════════════════════════════════

def _log_comb(n: int, k: int) -> float:
    """Log of binomial coefficient C(n, k) using Stirling approx for large n."""
    if k < 0 or k > n:
        return float("-inf")
    if k == 0 or k == n:
        return 0.0
    # Use log-gamma for precision
    return (
        math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
    )


def _hypergeometric_pvalue(k: int, M: int, n: int, N: int) -> float:
    """
    One-tailed (over-representation) hypergeometric test p-value.
    P(X >= k) where X ~ Hypergeometric(M, n, N)
    
    k: observed overlap (genes in both query set and pathway)
    M: total genes in background (genome ~20,000)
    n: genes in the pathway
    N: size of query gene set
    """
    if k <= 0 or n <= 0 or N <= 0 or M <= 0:
        return 1.0

    p_value = 0.0
    for i in range(k, min(n, N) + 1):
        log_p = _log_comb(n, i) + _log_comb(M - n, N - i) - _log_comb(M, N)
        p_value += math.exp(log_p)

    return min(p_value, 1.0)


def _benjamini_hochberg(p_values: List[float]) -> List[float]:
    """Benjamini-Hochberg FDR correction."""
    n = len(p_values)
    if n == 0:
        return []

    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    fdr = [0.0] * n

    min_so_far = 1.0
    for rank_idx in range(n - 1, -1, -1):
        orig_idx, pval = indexed[rank_idx]
        rank = rank_idx + 1
        corrected = pval * n / rank
        min_so_far = min(min_so_far, corrected)
        fdr[orig_idx] = min(min_so_far, 1.0)

    return fdr


# ═══════════════════════════════════════════════════════════════
#  KEGG REST API
# ═══════════════════════════════════════════════════════════════

KEGG_BASE = "https://rest.kegg.jp"


def _kegg_gene_to_pathways(gene: str) -> List[Dict[str, str]]:
    """Look up KEGG pathways for a human gene symbol."""
    try:
        # First resolve gene to KEGG ID
        url = f"{KEGG_BASE}/find/genes/{gene}+homo+sapiens"
        resp = requests.get(url, timeout=API_TIMEOUT)
        if resp.status_code != 200 or not resp.text.strip():
            return []

        # Parse first matching human gene
        kegg_id = None
        for line in resp.text.strip().split("\n"):
            parts = line.split("\t")
            if parts[0].startswith("hsa:"):
                kegg_id = parts[0]
                break

        if not kegg_id:
            return []

        # Get pathways for this gene
        url2 = f"{KEGG_BASE}/link/pathway/{kegg_id}"
        resp2 = requests.get(url2, timeout=API_TIMEOUT)
        if resp2.status_code != 200:
            return []

        pathways = []
        for line in resp2.text.strip().split("\n"):
            parts = line.split("\t")
            if len(parts) >= 2:
                pid = parts[1].replace("path:", "")
                pathways.append({"pathway_id": pid})

        return pathways

    except Exception as e:
        logger.debug(f"KEGG lookup failed for {gene}: {e}")
        return []


# ═══════════════════════════════════════════════════════════════
#  Reactome Content Service API
# ═══════════════════════════════════════════════════════════════

REACTOME_API = "https://reactome.org/AnalysisService"


def _query_reactome_enrichment(genes: List[str]) -> Optional[List[Dict[str, Any]]]:
    """
    POST gene list to Reactome Analysis Service for pathway enrichment.
    Returns enriched pathways or None on failure.
    """
    try:
        url = f"{REACTOME_API}/identifiers/projection"
        headers = {"Content-Type": "text/plain"}
        body = "\n".join(genes)

        resp = requests.post(
            url,
            data=body,
            headers=headers,
            params={"pageSize": 50, "page": 1, "sortBy": "ENTITIES_PVALUE", "order": "ASC",
                    "resource": "TOTAL", "pValue": 0.05, "includeDisease": True},
            timeout=API_TIMEOUT,
        )

        if resp.status_code != 200:
            logger.warning(f"Reactome returned HTTP {resp.status_code}")
            return None

        data = resp.json()
        pathways = data.get("pathways", [])

        results = []
        for pw in pathways:
            entities = pw.get("entities", {})
            results.append({
                "pathway_id": pw.get("stId", ""),
                "pathway_name": pw.get("name", ""),
                "source": "Reactome",
                "p_value": entities.get("pValue", 1.0),
                "fdr": entities.get("fdr", 1.0),
                "gene_count": entities.get("found", 0),
                "total_in_pathway": entities.get("total", 0),
                "genes": [],  # Reactome doesn't always list matched genes directly
                "species": pw.get("species", {}).get("name", "Homo sapiens"),
            })

        return results

    except Exception as e:
        logger.debug(f"Reactome enrichment failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════
#  Local Curated Pathway Database (Offline Fallback)
# ═══════════════════════════════════════════════════════════════

# Pathways with their gene sets — curated from KEGG/Reactome/GO
CURATED_PATHWAYS: List[Dict[str, Any]] = [
    {
        "pathway_id": "hsa04010",
        "pathway_name": "MAPK Signaling Pathway",
        "source": "KEGG",
        "genes": {"EGFR", "BRAF", "MAPK1", "SRC", "ABL1", "CDK2", "CDK4", "PTGS2"},
        "total_genes": 295,
    },
    {
        "pathway_id": "hsa04151",
        "pathway_name": "PI3K-Akt Signaling Pathway",
        "source": "KEGG",
        "genes": {"EGFR", "SRC", "ABL1", "CDK2", "CDK4", "ESR1", "HMGCR"},
        "total_genes": 354,
    },
    {
        "pathway_id": "hsa04020",
        "pathway_name": "Calcium Signaling Pathway",
        "source": "KEGG",
        "genes": {"HTR2A", "HTR2C", "DRD1", "ADRA1A", "SCN5A", "PDE4A", "PDE5A"},
        "total_genes": 240,
    },
    {
        "pathway_id": "hsa04080",
        "pathway_name": "Neuroactive Ligand-Receptor Interaction",
        "source": "KEGG",
        "genes": {"HTR1A", "HTR2A", "HTR2C", "DRD1", "DRD2", "ADRA1A", "ADORA2A"},
        "total_genes": 338,
    },
    {
        "pathway_id": "hsa00590",
        "pathway_name": "Arachidonic Acid Metabolism",
        "source": "KEGG",
        "genes": {"PTGS1", "PTGS2", "CYP3A4", "CYP1A2"},
        "total_genes": 68,
    },
    {
        "pathway_id": "hsa00140",
        "pathway_name": "Steroid Hormone Biosynthesis",
        "source": "KEGG",
        "genes": {"ESR1", "AR", "NR3C1", "CYP3A4", "CYP1A2"},
        "total_genes": 85,
    },
    {
        "pathway_id": "hsa00982",
        "pathway_name": "Drug Metabolism - Cytochrome P450",
        "source": "KEGG",
        "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "CYP2E1", "CYP2C9", "CYP2C19", "CYP19A1", "CYP17A1", "UGT1A1", "NQO1", "AKR1B1"},
        "total_genes": 74,
    },
    {
        "pathway_id": "hsa00983",
        "pathway_name": "Drug Metabolism - Other Enzymes",
        "source": "KEGG",
        "genes": {"UGT1A1", "SULT1A1", "CYP3A4", "CYP2D6"},
        "total_genes": 79,
    },
    {
        "pathway_id": "hsa02010",
        "pathway_name": "ABC Transporters",
        "source": "KEGG",
        "genes": {"ABCB1", "ALB"},
        "total_genes": 44,
    },
    {
        "pathway_id": "hsa00590b",
        "pathway_name": "Arachidonic Acid Metabolism (Lipoxygenase)",
        "source": "KEGG",
        "genes": {"ALOX5", "ALOX15", "PTGS1", "PTGS2", "CYP2E1"},
        "total_genes": 68,
    },
    {
        "pathway_id": "R-HSA-211945",
        "pathway_name": "Phase I - Functionalization of Compounds",
        "source": "Reactome",
        "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "CYP2E1", "CYP2C9", "CYP2C19", "CYP19A1", "CYP17A1"},
        "total_genes": 115,
    },
    {
        "pathway_id": "R-HSA-156580",
        "pathway_name": "Phase II - Conjugation of Compounds",
        "source": "Reactome",
        "genes": {"UGT1A1", "SULT1A1"},
        "total_genes": 78,
    },
    {
        "pathway_id": "GO:0006805",
        "pathway_name": "Xenobiotic Metabolic Process",
        "source": "GO_BP",
        "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "CYP2E1", "CYP2C9", "CYP2C19", "UGT1A1", "SULT1A1", "AHR", "ABCB1", "NQO1"},
        "total_genes": 320,
    },
    {
        "pathway_id": "hsa04110",
        "pathway_name": "Cell Cycle",
        "source": "KEGG",
        "genes": {"CDK2", "CDK4", "ABL1", "TUBB", "TUBA1A"},
        "total_genes": 124,
    },
    {
        "pathway_id": "hsa04915",
        "pathway_name": "Estrogen Signaling Pathway",
        "source": "KEGG",
        "genes": {"ESR1", "SRC", "EGFR", "MAPK1", "MMP9"},
        "total_genes": 138,
    },
    {
        "pathway_id": "hsa05200",
        "pathway_name": "Pathways in Cancer",
        "source": "KEGG",
        "genes": {"EGFR", "BRAF", "MAPK1", "ABL1", "SRC", "CDK2", "CDK4",
                  "MMP9", "PTGS2", "ESR1", "AR"},
        "total_genes": 531,
    },
    {
        "pathway_id": "R-HSA-9006934",
        "pathway_name": "Signaling by Receptor Tyrosine Kinases",
        "source": "Reactome",
        "genes": {"EGFR", "SRC", "ABL1", "BRAF", "MAPK1"},
        "total_genes": 470,
    },
    {
        "pathway_id": "R-HSA-418594",
        "pathway_name": "G Alpha (i) Signalling Events",
        "source": "Reactome",
        "genes": {"DRD2", "HTR1A", "ADORA2A", "PDE4A"},
        "total_genes": 190,
    },
    {
        "pathway_id": "R-HSA-2022090",
        "pathway_name": "Assembly of Collagen Fibrils and Other Multimeric Structures",
        "source": "Reactome",
        "genes": {"MMP9"},
        "total_genes": 56,
    },
    {
        "pathway_id": "R-HSA-211859",
        "pathway_name": "Biological Oxidations",
        "source": "Reactome",
        "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "NQO1"},
        "total_genes": 209,
    },
    {
        "pathway_id": "GO:0007169",
        "pathway_name": "Transmembrane Receptor Protein Tyrosine Kinase Signaling",
        "source": "GO_BP",
        "genes": {"EGFR", "SRC", "ABL1", "BRAF", "MAPK1", "CDK2"},
        "total_genes": 1200,
    },
    {
        "pathway_id": "GO:0006954",
        "pathway_name": "Inflammatory Response",
        "source": "GO_BP",
        "genes": {"PTGS1", "PTGS2", "MMP9", "ADORA2A", "MAPK1"},
        "total_genes": 750,
    },
    {
        "pathway_id": "GO:0042493",
        "pathway_name": "Response to Drug",
        "source": "GO_BP",
        "genes": {"CYP3A4", "CYP2D6", "CYP1A2", "HMGCR", "PTGS2", "ACHE"},
        "total_genes": 450,
    },
]

BACKGROUND_GENOME_SIZE = 20_000  # approximate number of protein-coding genes


def _local_pathway_enrichment(genes: List[str]) -> List[Dict[str, Any]]:
    """
    Compute pathway enrichment using curated pathway DB + hypergeometric test.
    """
    query_set = set(g.upper() for g in genes)
    N = len(query_set)

    if N == 0:
        return []

    results = []
    p_values = []

    for pw in CURATED_PATHWAYS:
        pw_genes = set(g.upper() for g in pw["genes"])
        overlap = query_set.intersection(pw_genes)
        k = len(overlap)

        if k == 0:
            continue

        n_pathway = pw["total_genes"]
        p_val = _hypergeometric_pvalue(k, BACKGROUND_GENOME_SIZE, n_pathway, N)
        p_values.append(p_val)

        results.append({
            "pathway_id": pw["pathway_id"],
            "pathway_name": pw["pathway_name"],
            "source": pw["source"],
            "p_value": round(p_val, 6),
            "fdr": 0.0,  # filled in later
            "gene_count": k,
            "total_in_pathway": n_pathway,
            "genes": sorted(overlap),
        })

    # FDR correction
    if p_values:
        fdr_values = _benjamini_hochberg(p_values)
        for i, r in enumerate(results):
            r["fdr"] = round(fdr_values[i], 6)

    # Sort by p-value
    results.sort(key=lambda x: x["p_value"])
    return results


# ═══════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════

def enrich_pathways(genes: List[str], p_threshold: float = 0.05
                    ) -> Dict[str, Any]:
    """
    Perform pathway enrichment analysis.
    
    Args:
        genes: List of gene symbols
        p_threshold: Maximum p-value cutoff
    
    Returns:
        {
            "query_genes": [...],
            "pathways": [{pathway_id, pathway_name, source, p_value, fdr, gene_count, genes}],
            "pathway_count": int,
            "sources_used": [...],
            "top_pathways": [...],   # top-5 pathway names for summary
        }
    """
    if not genes:
        return {"query_genes": [], "pathways": [], "pathway_count": 0,
                "sources_used": [], "top_pathways": []}

    gene_list = list(dict.fromkeys(g.upper() for g in genes))

    # Try Reactome API first
    reactome_results = _query_reactome_enrichment(gene_list)
    sources_used = []

    all_pathways = []

    if reactome_results:
        all_pathways.extend(reactome_results)
        sources_used.append("Reactome")

    # Always supplement with local curated pathways
    local_results = _local_pathway_enrichment(gene_list)
    if local_results:
        # Avoid duplicates by pathway_id
        existing_ids = {p["pathway_id"] for p in all_pathways}
        for lp in local_results:
            if lp["pathway_id"] not in existing_ids:
                all_pathways.append(lp)
        sources_used.extend(
            s for s in ["KEGG", "GO_BP"]
            if any(lp["source"] == s for lp in local_results)
        )
        if not sources_used or "KEGG" not in sources_used:
            if any(lp["source"] == "KEGG" for lp in local_results):
                sources_used.append("KEGG")

    if "local_curated" not in sources_used:
        sources_used.append("local_curated")

    # Filter by p-value threshold
    all_pathways = [p for p in all_pathways if p["p_value"] <= p_threshold]

    # Sort by p-value
    all_pathways.sort(key=lambda x: x["p_value"])

    top_pathways = [p["pathway_name"] for p in all_pathways[:5]]

    return {
        "query_genes": gene_list,
        "pathways": all_pathways,
        "pathway_count": len(all_pathways),
        "sources_used": list(set(sources_used)),
        "top_pathways": top_pathways,
    }

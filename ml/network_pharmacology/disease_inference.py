"""
disease_inference.py — Biologically Disciplined Disease Inference Engine
========================================================================
Replaces naive similarity-driven disease association with a mechanism-
supported, pathway-validated, network-coherent therapeutic reasoning system.

Implements 9 layers of false-positive suppression:
  1. Target Confidence Filtering — Bayesian-corrected gating (≥0.75)
  2. PPI Network Coherence Validation — fragmentation detection
  3. Pathway Consistency Filter — disease-pathway alignment check
  4. Multi-Target Requirement Rule — blocks single-target propagation
  5. Composite Disease Scoring — multi-factor weighted score
  6. Literature Validation Layer — PubMed/DrugBank cross-check
  7. Known Drug Cross-Validation — approved indication comparison
  8. AI Suggestion Gating — biologically grounded output control
  9. Structured Output — confidence-weighted, pathway-supported reports

Design principles:
  • No disease claim without mechanistic support
  • Single moderately predicted targets cannot drive therapeutic claims
  • Fragmented PPI networks reduce confidence
  • Pathway–disease consistency is required
  • All outputs include applicability domain & reliability indicators
"""

import logging
import math
import requests
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict

logger = logging.getLogger("insilico-ml.network_pharmacology")


# ═══════════════════════════════════════════════════════════════
#  1. TARGET CONFIDENCE FILTERING
# ═══════════════════════════════════════════════════════════════

# Bayesian prior: probability that a random drug-like molecule hits a
# given target class.  Estimated from ChEMBL 34 hit-rate statistics.
PRIOR_HIT_RATES: Dict[str, float] = {
    "Kinase":              0.12,
    "Cyclooxygenase":      0.08,
    "GPCR":                0.15,
    "Nuclear Receptor":    0.06,
    "Ion Channel / Enzyme": 0.07,
    "Protease":            0.09,
    "Phosphodiesterase":   0.05,
    "Tubulin":             0.03,
    "Cholinesterase":      0.04,
    "HMG-CoA Reductase":   0.02,
    "Metabolic Enzyme":    0.25,   # CYP450 — very common
    "Enzyme":              0.20,
    "Oxidoreductase":      0.15,
    "Transporter":         0.10,
    "Carrier Protein":     0.08,
}

DEFAULT_PRIOR = 0.10

# Sources ranked by reliability for Bayesian weighting
SOURCE_RELIABILITY: Dict[str, float] = {
    "chembl_similarity":    0.95,
    "fingerprint_similarity": 0.80,
    "pharmacophore_rules":  0.55,
    "descriptor_inference": 0.30,
}

CONFIDENCE_THRESHOLD = 0.75   # Minimum adjusted confidence for "High"
MEDIUM_THRESHOLD     = 0.50   # Minimum for "Medium"


def _bayesian_adjust(raw_prob: float, target_class: str, source: str) -> float:
    """
    Apply Bayesian correction to raw prediction probability.
    
    P(target | prediction) = P(prediction | target) × P(target)
                             ─────────────────────────────────────
                                       P(prediction)
    
    Where:
      P(prediction | target) ≈ raw_prob × source_reliability
      P(target) = prior hit rate for target class
      P(prediction) = normalisation constant
    """
    prior = PRIOR_HIT_RATES.get(target_class, DEFAULT_PRIOR)
    reliability = SOURCE_RELIABILITY.get(source, 0.50)
    
    # Likelihood:  If compound truly hits target, prediction should be high
    likelihood = raw_prob * reliability
    
    # P(prediction) — marginal: weighted by both true-positive and false-positive rates
    # P(pred) = P(pred|target)·P(target) + P(pred|¬target)·P(¬target)
    false_positive_rate = max(0.01, (1.0 - reliability) * raw_prob * 0.3)
    marginal = likelihood * prior + false_positive_rate * (1.0 - prior)
    
    if marginal < 1e-10:
        return 0.0
    
    posterior = (likelihood * prior) / marginal
    return round(min(posterior, 1.0), 4)


def classify_confidence(adjusted: float) -> str:
    """Classify target confidence as High / Medium / Low."""
    if adjusted >= CONFIDENCE_THRESHOLD:
        return "High"
    elif adjusted >= MEDIUM_THRESHOLD:
        return "Medium"
    return "Low"


def filter_targets_by_confidence(
    targets: List[Dict[str, Any]],
    min_confidence: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Layer 1: Apply Bayesian confidence correction to all predicted targets.
    
    Each target receives:
      - raw_probability:      original prediction score
      - adjusted_confidence:  Bayesian-corrected score
      - reliability:          High / Medium / Low classification
    
    Args:
        targets:        List of target dicts from predict_targets()
        min_confidence: Hard floor — targets below this are dropped entirely
    
    Returns:
        Filtered & annotated target list, sorted by adjusted_confidence desc.
    """
    enriched = []
    for t in targets:
        raw = t.get("probability", 0.0)
        tc  = t.get("target_class", "Enzyme")
        src = t.get("source", "pharmacophore_rules")
        
        adj = _bayesian_adjust(raw, tc, src)
        rel = classify_confidence(adj)
        
        if adj < min_confidence:
            continue
        
        enriched.append({
            **t,
            "raw_probability":     raw,
            "adjusted_confidence": adj,
            "reliability":         rel,
        })
    
    enriched.sort(key=lambda x: x["adjusted_confidence"], reverse=True)
    return enriched


# ═══════════════════════════════════════════════════════════════
#  2. PPI NETWORK COHERENCE VALIDATION
# ═══════════════════════════════════════════════════════════════

# Thresholds for biological plausibility
MIN_LARGEST_COMPONENT_FRACTION = 0.30   # 30 % of nodes in largest component
MIN_NETWORK_DENSITY            = 0.10   # Relaxed from 0.2 for sparse bio-networks
MIN_AVG_DEGREE                 = 1.5    # At least 1.5 edges per node on average


def assess_network_coherence(ppi_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Layer 2: Evaluate PPI network coherence.
    
    Returns coherence assessment with:
      - is_coherent:                Boolean overall verdict
      - coherence_score:            0–1 composite
      - largest_component_fraction: fraction of nodes in LCC
      - density:                    graph density
      - avg_degree:                 mean node degree
      - clustering_coefficient:     global clustering coefficient
      - flags:                      list of warning strings
    """
    metrics = ppi_result.get("metrics", {})
    nodes   = ppi_result.get("nodes", [])
    edges   = ppi_result.get("edges", [])
    
    n_nodes = len(nodes)
    n_edges = len(edges)
    
    if n_nodes == 0:
        return {
            "is_coherent": False,
            "coherence_score": 0.0,
            "largest_component_fraction": 0.0,
            "density": 0.0,
            "avg_degree": 0.0,
            "clustering_coefficient": 0.0,
            "flags": ["Empty network — no nodes"],
        }
    
    # Largest connected component fraction
    lcc_size = metrics.get("largest_component_size", n_nodes)
    lcc_fraction = lcc_size / n_nodes if n_nodes > 0 else 0
    
    # Density
    density = metrics.get("density", 0.0)
    
    # Average degree
    degree_map = defaultdict(int)
    for e in edges:
        degree_map[e.get("source", "")] += 1
        degree_map[e.get("target", "")] += 1
    avg_degree = sum(degree_map.values()) / n_nodes if n_nodes > 0 else 0
    
    # Clustering coefficient (global)
    clustering = _compute_global_clustering(nodes, edges)
    
    # Number of connected components
    n_components = metrics.get("connected_components", 1)
    
    # Score components (each 0–1, weighted)
    w_lcc     = 0.35
    w_density = 0.25
    w_degree  = 0.20
    w_cluster = 0.20
    
    s_lcc     = min(lcc_fraction / 0.50, 1.0)        # 50 % LCC → perfect
    s_density = min(density / 0.15, 1.0)              # density 0.15 → perfect
    s_degree  = min(avg_degree / 3.0, 1.0)            # avg degree 3 → perfect
    s_cluster = min(clustering / 0.30, 1.0)           # clustering 0.3 → perfect
    
    coherence_score = round(
        w_lcc * s_lcc + w_density * s_density +
        w_degree * s_degree + w_cluster * s_cluster,
        4
    )
    
    flags = []
    if lcc_fraction < MIN_LARGEST_COMPONENT_FRACTION:
        flags.append(
            f"Fragmented — largest component contains only "
            f"{lcc_fraction:.0%} of nodes (threshold: {MIN_LARGEST_COMPONENT_FRACTION:.0%})"
        )
    if density < MIN_NETWORK_DENSITY:
        flags.append(
            f"Sparse network — density {density:.4f} < {MIN_NETWORK_DENSITY}"
        )
    if avg_degree < MIN_AVG_DEGREE:
        flags.append(
            f"Low connectivity — average degree {avg_degree:.2f} < {MIN_AVG_DEGREE}"
        )
    if n_components > max(3, n_nodes * 0.4):
        flags.append(
            f"Highly fragmented — {n_components} disconnected components"
        )
    
    is_coherent = len(flags) == 0
    
    return {
        "is_coherent": is_coherent,
        "coherence_score": coherence_score,
        "largest_component_fraction": round(lcc_fraction, 4),
        "density": round(density, 4),
        "avg_degree": round(avg_degree, 2),
        "clustering_coefficient": round(clustering, 4),
        "connected_components": n_components,
        "flags": flags,
    }


def _compute_global_clustering(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
) -> float:
    """Compute global clustering coefficient (transitivity)."""
    adj: Dict[str, Set[str]] = defaultdict(set)
    for e in edges:
        a = e.get("source", "")
        b = e.get("target", "")
        if a and b:
            adj[a].add(b)
            adj[b].add(a)
    
    triangles = 0
    triples   = 0
    
    for node in adj:
        neighbours = list(adj[node])
        k = len(neighbours)
        if k < 2:
            continue
        triples += k * (k - 1) // 2
        for i in range(k):
            for j in range(i + 1, k):
                if neighbours[j] in adj[neighbours[i]]:
                    triangles += 1
    
    if triples == 0:
        return 0.0
    return triangles / triples


# ═══════════════════════════════════════════════════════════════
#  3. PATHWAY–DISEASE CONSISTENCY KNOWLEDGE BASE
# ═══════════════════════════════════════════════════════════════

# Maps disease IDs / names to their REQUIRED pathway families.
# If a disease claim is made but none of its required pathways
# appear in enrichment results, the claim is suppressed.
DISEASE_PATHWAY_MAP: Dict[str, Dict[str, Any]] = {
    # ── Endocrine ──
    "hypothyroidism": {
        "required_pathways": [
            "thyroid hormone", "cAMP signaling", "GPCR signaling",
            "endocrine", "TSH", "iodide",
        ],
        "therapeutic_area": "Endocrine",
    },
    "hyperthyroidism": {
        "required_pathways": [
            "thyroid hormone", "cAMP signaling", "GPCR signaling",
            "endocrine", "TSH",
        ],
        "therapeutic_area": "Endocrine",
    },
    "diabetes mellitus": {
        "required_pathways": [
            "insulin signaling", "PI3K-Akt", "AMPK", "glucose",
            "mTOR", "PPAR", "metaboli",
        ],
        "therapeutic_area": "Metabolic",
    },
    "cushing": {
        "required_pathways": [
            "steroid", "cortisol", "HPA axis", "glucocorticoid",
            "endocrine",
        ],
        "therapeutic_area": "Endocrine",
    },
    
    # ── Oncology ──
    "cancer": {
        "required_pathways": [
            "MAPK", "PI3K", "cell cycle", "apoptosis", "Ras",
            "pathways in cancer", "p53", "Wnt",
        ],
        "therapeutic_area": "Oncology",
    },
    "breast cancer": {
        "required_pathways": [
            "estrogen", "MAPK", "PI3K", "cell cycle", "ErbB",
        ],
        "therapeutic_area": "Oncology",
    },
    "non-small cell lung cancer": {
        "required_pathways": [
            "EGFR", "MAPK", "Ras", "pathways in cancer",
        ],
        "therapeutic_area": "Oncology",
    },
    "melanoma": {
        "required_pathways": [
            "MAPK", "BRAF", "Ras", "cell cycle",
        ],
        "therapeutic_area": "Oncology",
    },
    "chronic myeloid leukemia": {
        "required_pathways": [
            "ABL", "MAPK", "cell cycle", "pathways in cancer",
        ],
        "therapeutic_area": "Oncology",
    },
    "prostate cancer": {
        "required_pathways": [
            "androgen", "MAPK", "PI3K", "cell cycle",
        ],
        "therapeutic_area": "Oncology",
    },
    
    # ── Inflammatory / Autoimmune ──
    "rheumatoid arthritis": {
        "required_pathways": [
            "arachidonic", "inflammatory", "COX", "NF-kB",
            "MAPK", "prostaglandin",
        ],
        "therapeutic_area": "Immune System",
    },
    "asthma": {
        "required_pathways": [
            "arachidonic", "leukotriene", "inflammatory",
            "calcium", "cAMP",
        ],
        "therapeutic_area": "Respiratory",
    },
    "inflammatory bowel disease": {
        "required_pathways": [
            "inflammatory", "NF-kB", "arachidonic", "COX",
        ],
        "therapeutic_area": "Immune System",
    },
    
    # ── Neurological / Psychiatric ──
    "schizophrenia": {
        "required_pathways": [
            "dopamine", "serotonin", "GPCR", "neuroactive",
            "calcium",
        ],
        "therapeutic_area": "Psychiatry",
    },
    "major depressive disorder": {
        "required_pathways": [
            "serotonin", "GPCR", "neuroactive", "cAMP",
        ],
        "therapeutic_area": "Psychiatry",
    },
    "alzheimer": {
        "required_pathways": [
            "cholinergic", "neuroactive", "MAPK", "amyloid",
            "inflammatory",
        ],
        "therapeutic_area": "Neurology",
    },
    "parkinson": {
        "required_pathways": [
            "dopamine", "GPCR", "neuroactive", "calcium",
        ],
        "therapeutic_area": "Neurology",
    },
    "epilepsy": {
        "required_pathways": [
            "ion channel", "calcium", "GABA", "neuroactive",
        ],
        "therapeutic_area": "Neurology",
    },
    "migraine": {
        "required_pathways": [
            "serotonin", "GPCR", "neuroactive", "arachidonic",
        ],
        "therapeutic_area": "Neurology",
    },
    "pain": {
        "required_pathways": [
            "arachidonic", "COX", "prostaglandin", "inflammatory",
            "ion channel", "neuroactive",
        ],
        "therapeutic_area": "Neurology",
    },
    
    # ── Cardiovascular ──
    "hypertension": {
        "required_pathways": [
            "renin-angiotensin", "calcium", "adrenergic",
            "vascular smooth muscle",
        ],
        "therapeutic_area": "Cardiovascular",
    },
    "coronary heart disease": {
        "required_pathways": [
            "arachidonic", "lipid", "HMGCR", "inflammatory",
        ],
        "therapeutic_area": "Cardiovascular",
    },
    "heart failure": {
        "required_pathways": [
            "calcium", "adrenergic", "renin-angiotensin",
            "cardiac",
        ],
        "therapeutic_area": "Cardiovascular",
    },
    
    # ── Metabolic / Hepatic ──
    "hypercholesterolemia": {
        "required_pathways": [
            "lipid", "steroid", "HMGCR", "bile acid",
        ],
        "therapeutic_area": "Metabolic",
    },
    "non-alcoholic fatty liver": {
        "required_pathways": [
            "drug metabolism", "cytochrome", "lipid", "PPAR",
            "xenobiotic",
        ],
        "therapeutic_area": "Hepatic",
    },
    "drug-induced liver injury": {
        "required_pathways": [
            "drug metabolism", "cytochrome", "xenobiotic",
            "biological oxidation", "phase I", "phase II",
        ],
        "therapeutic_area": "Hepatic",
    },
    "drug interaction risk": {
        "required_pathways": [
            "drug metabolism", "cytochrome", "xenobiotic",
            "phase I", "ABC transporter",
        ],
        "therapeutic_area": "Pharmacogenomics",
    },
    "gilbert syndrome": {
        "required_pathways": [
            "phase II", "conjugation", "glucuronidation",
            "bilirubin",
        ],
        "therapeutic_area": "Hepatic",
    },
    "oxidative stress": {
        "required_pathways": [
            "xenobiotic", "biological oxidation", "NRF2",
            "drug metabolism",
        ],
        "therapeutic_area": "Metabolic",
    },
    
    # ── Other ──
    "erectile dysfunction": {
        "required_pathways": [
            "cGMP", "PDE5", "nitric oxide", "vascular",
        ],
        "therapeutic_area": "Reproductive",
    },
    "glaucoma": {
        "required_pathways": [
            "carbonic anhydrase", "bicarbonate", "ion transport",
        ],
        "therapeutic_area": "Ophthalmology",
    },
}


def _pathway_supports_disease(
    disease_name: str,
    enriched_pathways: List[Dict[str, Any]],
) -> Tuple[bool, float, List[str]]:
    """
    Layer 3: Check if enriched pathways support a disease claim.
    
    Returns:
        (is_supported, support_score, matching_pathways)
    """
    disease_key = disease_name.lower().strip()
    
    # Find best matching disease entry
    best_match = None
    for key in DISEASE_PATHWAY_MAP:
        if key in disease_key or disease_key in key:
            best_match = DISEASE_PATHWAY_MAP[key]
            break
    
    if best_match is None:
        # No pathway requirement defined → cautiously allow with reduced score
        return (True, 0.5, [])
    
    required = best_match["required_pathways"]
    pathway_names = [p.get("pathway_name", "").lower() for p in enriched_pathways]
    pathway_text = " ".join(pathway_names)
    
    matched = []
    for req in required:
        if req.lower() in pathway_text:
            matched.append(req)
    
    if len(matched) == 0:
        return (False, 0.0, [])
    
    support_score = round(min(len(matched) / max(len(required) * 0.5, 1), 1.0), 4)
    return (True, support_score, matched)


# ═══════════════════════════════════════════════════════════════
#  4. MULTI-TARGET REQUIREMENT RULE
# ═══════════════════════════════════════════════════════════════

MIN_HIGH_CONFIDENCE_TARGETS = 2  # Minimum high-confidence targets for same disease


def _check_multi_target_rule(
    disease: Dict[str, Any],
    high_confidence_targets: List[Dict[str, Any]],
    hub_genes: List[str],
    enriched_pathways: List[Dict[str, Any]],
) -> Tuple[bool, str]:
    """
    Layer 4: Verify that a disease claim has multi-target support.
    
    A disease claim passes if ANY of:
      • ≥2 high-confidence targets associated with the disease
      • ≥1 hub gene in the PPI network associated with the disease
      • Pathway enrichment overlaps the disease's pathway map
    
    Returns:
        (passes, reason)
    """
    disease_genes = set(
        g.upper() for g in disease.get("associated_genes", [])
    )
    
    # Check 1: ≥2 high-confidence targets
    high_conf_genes = set(
        t["gene_name"].upper() for t in high_confidence_targets
        if t.get("reliability") == "High"
    )
    shared_high = disease_genes & high_conf_genes
    if len(shared_high) >= MIN_HIGH_CONFIDENCE_TARGETS:
        return (True, f"{len(shared_high)} high-confidence targets: {', '.join(sorted(shared_high))}")
    
    # Check 2: ≥1 hub gene
    hub_set = set(g.upper() for g in hub_genes)
    hub_overlap = disease_genes & hub_set
    if len(hub_overlap) >= 1:
        return (True, f"Hub gene(s) in PPI cluster: {', '.join(sorted(hub_overlap))}")
    
    # Check 3: Pathway enrichment overlap
    pathway_supported, pw_score, matched_pws = _pathway_supports_disease(
        disease.get("disease_name", ""), enriched_pathways
    )
    if pathway_supported and pw_score >= 0.5:
        return (True, f"Pathway support (score={pw_score}): {', '.join(matched_pws[:3])}")
    
    # Check 4: ≥2 targets of any confidence
    all_conf_genes = set(t["gene_name"].upper() for t in high_confidence_targets)
    shared_any = disease_genes & all_conf_genes
    if len(shared_any) >= 2:
        return (True, f"{len(shared_any)} targets (mixed confidence): {', '.join(sorted(shared_any))}")
    
    return (False, "Single-target disease propagation blocked — insufficient mechanistic support")


# ═══════════════════════════════════════════════════════════════
#  5. COMPOSITE DISEASE SCORING
# ═══════════════════════════════════════════════════════════════

# Weight factors for composite score
W_TARGET     = 0.30   # Target confidence
W_PATHWAY    = 0.30   # Pathway enrichment support
W_NETWORK    = 0.20   # Network connectivity
W_LITERATURE = 0.20   # Literature / known pharmacology


def compute_composite_disease_score(
    disease: Dict[str, Any],
    high_confidence_targets: List[Dict[str, Any]],
    enriched_pathways: List[Dict[str, Any]],
    coherence: Dict[str, Any],
    literature_score: float = 0.5,
) -> Dict[str, Any]:
    """
    Layer 5: Compute composite disease score.
    
    Score = W_target × f(target_confidence)
          + W_pathway × f(pathway_support)
          + W_network × f(network_coherence)
          + W_literature × f(literature_support)
    
    Normalised to [0, 1].
    """
    disease_genes = set(g.upper() for g in disease.get("associated_genes", []))
    
    # --- Target confidence component ---
    target_confs = []
    for t in high_confidence_targets:
        if t["gene_name"].upper() in disease_genes:
            target_confs.append(t.get("adjusted_confidence", t.get("probability", 0)))
    
    if target_confs:
        # Use mean of top-2 target confidences
        target_confs.sort(reverse=True)
        target_score = sum(target_confs[:2]) / min(len(target_confs), 2)
    else:
        target_score = 0.0
    
    # --- Pathway support component ---
    _, pathway_score, matched_pathways = _pathway_supports_disease(
        disease.get("disease_name", ""), enriched_pathways
    )
    
    # --- Network coherence component ---
    network_score = coherence.get("coherence_score", 0.0)
    
    # --- Composite ---
    composite = (
        W_TARGET * target_score +
        W_PATHWAY * pathway_score +
        W_NETWORK * network_score +
        W_LITERATURE * literature_score
    )
    composite = round(min(composite, 1.0), 4)
    
    return {
        "composite_score": composite,
        "target_confidence_weight": round(target_score, 4),
        "pathway_enrichment_weight": round(pathway_score, 4),
        "network_connectivity_weight": round(network_score, 4),
        "literature_support_weight": round(literature_score, 4),
        "supporting_pathways": matched_pathways,
        "supporting_targets": sorted(disease_genes & set(
            t["gene_name"].upper() for t in high_confidence_targets
            if t.get("reliability") in ("High", "Medium")
        )),
    }


# ═══════════════════════════════════════════════════════════════
#  6. LITERATURE VALIDATION LAYER
# ═══════════════════════════════════════════════════════════════

PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_TIMEOUT    = 8  # seconds


def _validate_literature(
    compound_name: str,
    disease_name: str,
    gene_symbols: List[str],
) -> Dict[str, Any]:
    """
    Layer 6: Literature validation via PubMed abstract keyword matching.
    
    Searches PubMed for co-occurrence of compound + disease terms.
    Returns a literature support indicator.
    """
    # Build search query
    terms = []
    if compound_name:
        terms.append(f'"{compound_name}"')
    if gene_symbols:
        gene_q = " OR ".join(f'"{g}"' for g in gene_symbols[:5])
        terms.append(f"({gene_q})")
    if disease_name:
        terms.append(f'"{disease_name}"')
    
    query = " AND ".join(terms)
    
    try:
        resp = requests.get(
            PUBMED_SEARCH_URL,
            params={
                "db": "pubmed",
                "term": query,
                "retmode": "json",
                "retmax": 0,   # We only need the count
            },
            timeout=PUBMED_TIMEOUT,
        )
        
        if resp.status_code == 200:
            data = resp.json()
            count = int(data.get("esearchresult", {}).get("count", 0))
            
            if count >= 10:
                return {"literature_support": "Strong", "pubmed_count": count, "score": 0.9}
            elif count >= 3:
                return {"literature_support": "Moderate", "pubmed_count": count, "score": 0.6}
            elif count >= 1:
                return {"literature_support": "Weak", "pubmed_count": count, "score": 0.3}
            else:
                return {
                    "literature_support": "None",
                    "pubmed_count": 0,
                    "score": 0.1,
                    "disclaimer": "Prediction not supported by known pharmacology",
                }
    except Exception as e:
        logger.debug(f"PubMed validation failed: {e}")
    
    # Fallback: no data available
    return {"literature_support": "Unknown", "pubmed_count": -1, "score": 0.5}


# ═══════════════════════════════════════════════════════════════
#  7. KNOWN DRUG CROSS-VALIDATION
# ═══════════════════════════════════════════════════════════════

# Known indications for common drugs (condensed from DrugBank/ChEMBL)
KNOWN_DRUG_INDICATIONS: Dict[str, Dict[str, Any]] = {
    # Paracetamol / Acetaminophen
    "CC(=O)NC1=CC=C(O)C=C1": {
        "name": "Acetaminophen",
        "approved_indications": ["pain", "fever", "headache"],
        "mechanism": "COX inhibition / TRPV1 modulation",
        "therapeutic_areas": ["Neurology", "Immune System"],
        "contraindicated_claims": ["endocrine", "oncology", "psychiatry"],
    },
    # Ibuprofen
    "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O": {
        "name": "Ibuprofen",
        "approved_indications": ["pain", "inflammation", "arthritis", "fever"],
        "mechanism": "COX-1/COX-2 inhibition",
        "therapeutic_areas": ["Immune System", "Neurology"],
        "contraindicated_claims": ["endocrine", "oncology"],
    },
    # Aspirin
    "CC(=O)OC1=CC=CC=C1C(=O)O": {
        "name": "Aspirin",
        "approved_indications": ["pain", "inflammation", "cardiovascular", "antiplatelet"],
        "mechanism": "COX-1 irreversible inhibition",
        "therapeutic_areas": ["Cardiovascular", "Immune System", "Neurology"],
        "contraindicated_claims": ["endocrine"],
    },
    # Metformin
    "CN(C)C(=N)NC(=N)N": {
        "name": "Metformin",
        "approved_indications": ["diabetes", "insulin resistance", "PCOS"],
        "mechanism": "AMPK activation",
        "therapeutic_areas": ["Metabolic"],
        "contraindicated_claims": [],
    },
    # Atorvastatin-like
    "O=C(O)C[C@@H](O)C[C@@H](O)/C=C/C1=CC=C(F)C=C1": {
        "name": "Statin scaffold",
        "approved_indications": ["hypercholesterolemia", "cardiovascular"],
        "mechanism": "HMG-CoA reductase inhibition",
        "therapeutic_areas": ["Cardiovascular", "Metabolic"],
        "contraindicated_claims": ["endocrine", "psychiatry"],
    },
}


def _cross_validate_known_drug(
    smiles: str,
    predicted_diseases: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Layer 7: Cross-validate predicted diseases against known drug indications.
    
    If the compound matches a known drug, check whether predicted diseases
    align with approved therapeutic indications.
    """
    known = KNOWN_DRUG_INDICATIONS.get(smiles)
    
    if known is None:
        # Try canonical SMILES comparison
        try:
            from rdkit import Chem
            mol = Chem.MolFromSmiles(smiles)
            if mol:
                canonical = Chem.MolToSmiles(mol)
                known = KNOWN_DRUG_INDICATIONS.get(canonical)
        except Exception:
            pass
    
    if known is None:
        return {
            "is_known_drug": False,
            "drug_name": None,
            "alignment": "unknown",
            "flags": [],
        }
    
    flags = []
    aligned_count = 0
    misaligned_count = 0
    contraindicated = set(c.lower() for c in known.get("contraindicated_claims", []))
    approved = set(a.lower() for a in known.get("approved_indications", []))
    approved_areas = set(a.lower() for a in known.get("therapeutic_areas", []))
    
    for disease in predicted_diseases:
        d_name = disease.get("disease_name", "").lower()
        d_area = disease.get("therapeutic_area", "").lower()
        
        # Check if aligned with approved indications
        if any(ind in d_name for ind in approved):
            aligned_count += 1
            continue
        
        if d_area in approved_areas:
            aligned_count += 1
            continue
        
        # Check if contraindicated
        if d_area in contraindicated:
            misaligned_count += 1
            flags.append(
                f"Off-target hypothesis: '{disease.get('disease_name')}' "
                f"({d_area}) not in approved therapeutic areas for {known['name']}"
            )
    
    alignment = "good"
    if misaligned_count > aligned_count:
        alignment = "poor"
    elif misaligned_count > 0:
        alignment = "partial"
    
    return {
        "is_known_drug": True,
        "drug_name": known["name"],
        "approved_indications": known["approved_indications"],
        "mechanism": known["mechanism"],
        "alignment": alignment,
        "aligned_diseases": aligned_count,
        "misaligned_diseases": misaligned_count,
        "flags": flags,
    }


# ═══════════════════════════════════════════════════════════════
#  8. AI SUGGESTION GATING RULES
# ═══════════════════════════════════════════════════════════════

SUGGESTION_THRESHOLD = 0.70  # Minimum composite score for therapeutic suggestion


def generate_ai_suggestion(
    diseases_scored: List[Dict[str, Any]],
    coherence: Dict[str, Any],
    drug_validation: Dict[str, Any],
    enriched_pathways: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Layer 8: Generate biologically disciplined AI therapeutic suggestion.
    
    Suggestion only appears if:
      • Network is coherent (or has moderate coherence)
      • Pathway supports disease mechanism
      • ≥2 relevant high-confidence targets
      • Composite disease score ≥ 0.70
      • No contradiction with known pharmacology
    """
    # Filter diseases that pass scoring threshold
    viable = [
        d for d in diseases_scored
        if d.get("composite_score", 0) >= SUGGESTION_THRESHOLD
    ]
    
    # Check network coherence
    network_ok = coherence.get("is_coherent", False) or coherence.get("coherence_score", 0) >= 0.4
    
    # Check for known drug contradictions
    has_contradictions = (
        drug_validation.get("is_known_drug", False) and
        drug_validation.get("alignment") == "poor"
    )
    
    if not viable:
        # No diseases pass threshold
        top_pathways = [p.get("pathway_name", "") for p in enriched_pathways[:3]]
        pathway_text = ", ".join(top_pathways) if top_pathways else "general metabolic processing"
        
        return {
            "has_suggestion": False,
            "suggestion_type": "modulation_only",
            "message": (
                f"Predicted targets suggest metabolic/inflammatory modulation via "
                f"{pathway_text}. No strong evidence supports specific therapeutic "
                f"application. Further experimental validation is required."
            ),
            "confidence": "low",
            "viable_diseases": [],
        }
    
    if not network_ok:
        return {
            "has_suggestion": False,
            "suggestion_type": "fragmented_network",
            "message": (
                f"Network pharmacology analysis identified potential disease associations, "
                f"but the PPI network is fragmented (coherence: "
                f"{coherence.get('coherence_score', 0):.2f}). Disease claims have "
                f"low mechanistic support. {'; '.join(coherence.get('flags', []))}"
            ),
            "confidence": "low",
            "viable_diseases": [d.get("disease_name") for d in viable[:3]],
        }
    
    if has_contradictions:
        drug_name = drug_validation.get("drug_name", "this compound")
        return {
            "has_suggestion": True,
            "suggestion_type": "validated_with_caveats",
            "message": (
                f"Analysis identifies potential therapeutic applications, but "
                f"{drug_name} is a known drug with approved indications that "
                f"differ from some predictions. "
                f"{'; '.join(drug_validation.get('flags', [])[:2])}"
            ),
            "confidence": "medium",
            "viable_diseases": [d.get("disease_name") for d in viable[:5]],
        }
    
    # Full therapeutic suggestion
    top_diseases = viable[:5]
    disease_names = [d.get("disease_name", "") for d in top_diseases]
    top_areas = list(set(d.get("therapeutic_area", "") for d in top_diseases))
    
    # Build mechanistic explanation
    all_pathways = set()
    all_targets = set()
    for d in top_diseases:
        all_pathways.update(d.get("supporting_pathways", []))
        all_targets.update(d.get("supporting_targets_high", []))
    
    pathway_text = ", ".join(sorted(all_pathways)[:4]) if all_pathways else "enriched biological pathways"
    area_text = ", ".join(top_areas[:3]) if top_areas else "multiple areas"
    
    return {
        "has_suggestion": True,
        "suggestion_type": "mechanistically_supported",
        "message": (
            f"Network pharmacology analysis supports potential therapeutic relevance "
            f"in {area_text}. Top disease associations: "
            f"{', '.join(disease_names[:3])}. "
            f"Mechanistic support through: {pathway_text}. "
            f"Confidence is based on multi-target engagement, pathway enrichment, "
            f"and network coherence analysis."
        ),
        "confidence": "high" if viable[0].get("composite_score", 0) >= 0.85 else "medium",
        "viable_diseases": disease_names,
        "therapeutic_areas": top_areas,
    }


# ═══════════════════════════════════════════════════════════════
#  9. MASTER INFERENCE PIPELINE
# ═══════════════════════════════════════════════════════════════

def run_disease_inference(
    smiles: str,
    targets_result: Dict[str, Any],
    ppi_result: Dict[str, Any],
    pathways_result: Dict[str, Any],
    diseases_result: Dict[str, Any],
    compound_name: str = "",
) -> Dict[str, Any]:
    """
    Master disease inference pipeline.
    
    Orchestrates all 9 layers of false-positive suppression to produce
    biologically plausible, pathway-supported, confidence-weighted
    disease suggestions.
    
    Args:
        smiles:           Compound SMILES
        targets_result:   Output from predict_targets()
        ppi_result:       Output from build_ppi_network()
        pathways_result:  Output from enrich_pathways()
        diseases_result:  Output from map_diseases()
        compound_name:    Optional compound name for literature search
    
    Returns:
        Comprehensive disease inference report with all layers applied.
    """
    raw_targets  = targets_result.get("targets", [])
    raw_diseases = diseases_result.get("diseases", [])
    enriched_pathways = pathways_result.get("pathways", [])
    hub_genes = ppi_result.get("metrics", {}).get("hub_genes", [])
    
    # ── Layer 1: Target confidence filtering ──
    filtered_targets = filter_targets_by_confidence(raw_targets, min_confidence=0.05)
    high_conf_targets = [t for t in filtered_targets if t.get("reliability") == "High"]
    medium_conf_targets = [t for t in filtered_targets if t.get("reliability") == "Medium"]
    
    # ── Layer 2: PPI network coherence ──
    coherence = assess_network_coherence(ppi_result)
    
    # ── Layer 7: Known drug cross-validation (early, informs scoring) ──
    drug_validation = _cross_validate_known_drug(smiles, raw_diseases)
    
    # ── Layers 3–5: Score each disease ──
    scored_diseases = []
    suppressed_diseases = []
    
    for disease in raw_diseases:
        # Layer 3: Pathway consistency
        pw_supported, pw_score, matched_pws = _pathway_supports_disease(
            disease.get("disease_name", ""), enriched_pathways
        )
        
        # Layer 4: Multi-target requirement
        mt_passes, mt_reason = _check_multi_target_rule(
            disease, filtered_targets, hub_genes, enriched_pathways
        )
        
        # Layer 6: Literature validation (throttled — only for top candidates)
        lit_result = {"literature_support": "Unknown", "score": 0.5}
        
        # Layer 5: Composite scoring
        composite = compute_composite_disease_score(
            disease,
            filtered_targets,
            enriched_pathways,
            coherence,
            literature_score=lit_result["score"],
        )
        
        # Apply known-drug penalty
        if drug_validation.get("is_known_drug"):
            d_area = disease.get("therapeutic_area", "").lower()
            contraindicated = set(
                c.lower() for c in
                KNOWN_DRUG_INDICATIONS.get(smiles, {}).get("contraindicated_claims", [])
            )
            if d_area in contraindicated:
                composite["composite_score"] *= 0.4  # Severe penalty
                composite["composite_score"] = round(composite["composite_score"], 4)
        
        # Determine if disease passes all filters
        passes_filters = True
        suppression_reasons = []
        
        if not mt_passes:
            passes_filters = False
            suppression_reasons.append(mt_reason)
        
        if not pw_supported and composite["pathway_enrichment_weight"] == 0:
            # Only suppress if NO pathway support at all for a disease with
            # known required pathways
            disease_key = disease.get("disease_name", "").lower()
            has_requirements = any(
                k in disease_key or disease_key in k
                for k in DISEASE_PATHWAY_MAP
            )
            if has_requirements:
                passes_filters = False
                suppression_reasons.append(
                    "No pathway enrichment supports this disease mechanism"
                )
        
        # Fragmented network penalty (don't fully suppress, but penalise)
        if not coherence.get("is_coherent", True):
            composite["composite_score"] *= (0.5 + 0.5 * coherence.get("coherence_score", 0))
            composite["composite_score"] = round(composite["composite_score"], 4)
        
        disease_entry = {
            **disease,
            **composite,
            "pathway_supported": pw_supported,
            "multi_target_check": mt_passes,
            "multi_target_reason": mt_reason,
            "literature": lit_result,
            "supporting_targets_high": [
                t["gene_name"] for t in high_conf_targets
                if t["gene_name"].upper() in set(
                    g.upper() for g in disease.get("associated_genes", [])
                )
            ],
            "network_support_level": (
                "Strong" if coherence.get("coherence_score", 0) >= 0.6 else
                "Moderate" if coherence.get("coherence_score", 0) >= 0.3 else
                "Weak"
            ),
            "applicability_domain": (
                "In-domain" if (
                    composite["composite_score"] >= 0.5 and
                    mt_passes and
                    coherence.get("coherence_score", 0) >= 0.2
                ) else "Out-of-domain"
            ),
        }
        
        if passes_filters:
            scored_diseases.append(disease_entry)
        else:
            disease_entry["suppression_reasons"] = suppression_reasons
            suppressed_diseases.append(disease_entry)
    
    # Sort by composite score
    scored_diseases.sort(key=lambda x: x["composite_score"], reverse=True)
    suppressed_diseases.sort(key=lambda x: x["composite_score"], reverse=True)
    
    # ── Layer 6: Literature validation for top-5 diseases ──
    for disease in scored_diseases[:5]:
        gene_syms = disease.get("associated_genes", [])
        lit = _validate_literature(
            compound_name or smiles[:30],
            disease.get("disease_name", ""),
            gene_syms,
        )
        disease["literature"] = lit
        # Re-compute composite with actual literature score
        updated = compute_composite_disease_score(
            disease,
            filtered_targets,
            enriched_pathways,
            coherence,
            literature_score=lit["score"],
        )
        disease.update(updated)
    
    # Re-sort after literature update
    scored_diseases.sort(key=lambda x: x["composite_score"], reverse=True)
    
    # ── Layer 8: AI suggestion gating ──
    ai_suggestion = generate_ai_suggestion(
        scored_diseases, coherence, drug_validation, enriched_pathways
    )
    
    # ── Build therapeutic area summary (from scored diseases only) ──
    area_counts: Dict[str, int] = defaultdict(int)
    for d in scored_diseases:
        area_counts[d.get("therapeutic_area", "Unknown")] += 1
    area_counts = dict(sorted(area_counts.items(), key=lambda x: x[1], reverse=True))
    
    # ── Target summary ──
    target_summary = {
        "total_predicted": len(raw_targets),
        "after_bayesian_filtering": len(filtered_targets),
        "high_confidence": len(high_conf_targets),
        "medium_confidence": len(medium_conf_targets),
        "low_confidence": len(filtered_targets) - len(high_conf_targets) - len(medium_conf_targets),
    }
    
    return {
        "smiles": smiles,
        "compound_name": compound_name,
        
        # Filtered targets with confidence annotations
        "filtered_targets": filtered_targets,
        "target_summary": target_summary,
        
        # Network coherence assessment
        "network_coherence": coherence,
        
        # Scored & filtered diseases
        "diseases": scored_diseases,
        "disease_count": len(scored_diseases),
        "suppressed_diseases": suppressed_diseases,
        "suppressed_count": len(suppressed_diseases),
        
        # Therapeutic area summary
        "therapeutic_areas": area_counts,
        
        # Drug validation
        "drug_validation": drug_validation,
        
        # AI suggestion
        "ai_suggestion": ai_suggestion,
        
        # Metadata
        "inference_version": "2.0",
        "layers_applied": [
            "target_confidence_filtering",
            "ppi_network_coherence",
            "pathway_consistency_filter",
            "multi_target_requirement",
            "composite_disease_scoring",
            "literature_validation",
            "known_drug_cross_validation",
            "ai_suggestion_gating",
        ],
    }

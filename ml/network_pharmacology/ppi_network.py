"""
ppi_network.py — Protein-Protein Interaction Network Construction
=================================================================
Given a list of gene/protein names (from target_prediction), builds
a PPI network using:
  1. STRING DB REST API (primary — free, no key required)
  2. Local curated interaction fallback

Returns a graph structure (nodes + edges) with centrality metrics,
community/cluster detection, and hub gene identification.
"""

import logging
import math
import requests
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict

logger = logging.getLogger("insilico-ml.network_pharmacology")

API_TIMEOUT = 15  # seconds
STRING_API_BASE = "https://string-db.org/api"
SPECIES_HUMAN = 9606  # NCBI taxonomy ID for Homo sapiens


# ═══════════════════════════════════════════════════════════════
#  STRING DB API
# ═══════════════════════════════════════════════════════════════

def _resolve_string_ids(genes: List[str]) -> Dict[str, str]:
    """Resolve gene names to STRING identifiers."""
    try:
        url = f"{STRING_API_BASE}/json/get_string_ids"
        params = {
            "identifiers": "\r".join(genes),
            "species": SPECIES_HUMAN,
            "limit": 1,
        }
        resp = requests.get(url, params=params, timeout=API_TIMEOUT)
        if resp.status_code != 200:
            return {}

        data = resp.json()
        mapping = {}
        for entry in data:
            query = entry.get("queryItem", "")
            string_id = entry.get("stringId", "")
            preferred = entry.get("preferredName", query)
            if query and string_id:
                mapping[query] = string_id
        return mapping

    except Exception as e:
        logger.debug(f"STRING ID resolution failed: {e}")
        return {}


def _query_string_interactions(genes: List[str], min_score: int = 400
                                ) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch PPI edges from STRING DB.
    min_score: minimum combined score (0-1000, 400=medium confidence).
    """
    try:
        url = f"{STRING_API_BASE}/json/network"
        params = {
            "identifiers": "\r".join(genes),
            "species": SPECIES_HUMAN,
            "required_score": min_score,
            "network_type": "functional",
            "caller_identity": "InSilico_NetPharm",
        }
        resp = requests.get(url, params=params, timeout=API_TIMEOUT)
        if resp.status_code != 200:
            logger.warning(f"STRING network returned HTTP {resp.status_code}")
            return None

        return resp.json()

    except Exception as e:
        logger.debug(f"STRING network query failed: {e}")
        return None


def _query_string_enrichment(genes: List[str]) -> Optional[List[Dict[str, Any]]]:
    """Fetch functional enrichment from STRING to get interaction context."""
    try:
        url = f"{STRING_API_BASE}/json/enrichment"
        params = {
            "identifiers": "\r".join(genes),
            "species": SPECIES_HUMAN,
            "caller_identity": "InSilico_NetPharm",
        }
        resp = requests.get(url, params=params, timeout=API_TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
#  Local Curated Interaction Fallback
# ═══════════════════════════════════════════════════════════════

# Curated high-confidence interactions from literature / KEGG / Reactome
# Format: (geneA, geneB, combined_score, interaction_type)
CURATED_PPI: List[Tuple[str, str, float, str]] = [
    # MAPK/ERK pathway
    ("EGFR", "SRC", 0.95, "activation"),
    ("EGFR", "BRAF", 0.90, "activation"),
    ("BRAF", "MAPK1", 0.97, "activation"),
    ("SRC", "MAPK1", 0.85, "activation"),
    ("MAPK1", "CDK2", 0.70, "activation"),
    ("CDK2", "CDK4", 0.88, "binding"),

    # PI3K/AKT pathway
    ("EGFR", "ABL1", 0.80, "binding"),
    ("ABL1", "SRC", 0.90, "binding"),

    # Inflammatory pathway
    ("PTGS1", "PTGS2", 0.92, "coexpression"),
    ("PTGS2", "MAPK1", 0.75, "activation"),
    ("PTGS2", "NQO1", 0.60, "coexpression"),

    # Serotonin / GPCR signaling
    ("HTR1A", "HTR2A", 0.88, "binding"),
    ("HTR2A", "HTR2C", 0.90, "binding"),
    ("DRD1", "DRD2", 0.92, "binding"),
    ("DRD2", "HTR2A", 0.65, "coexpression"),

    # Nuclear receptors
    ("ESR1", "AR", 0.72, "coexpression"),
    ("ESR1", "NR3C1", 0.80, "binding"),
    ("AR", "NR3C1", 0.78, "binding"),

    # Drug metabolism — CYP450 superfamily (STRING 11.5, validated coexpression)
    ("CYP3A4", "CYP2D6", 0.85, "coexpression"),
    ("CYP3A4", "CYP1A2", 0.82, "coexpression"),
    ("CYP2D6", "CYP1A2", 0.80, "coexpression"),
    ("CYP3A4", "HMGCR", 0.60, "reaction"),
    ("CYP3A4", "CYP2E1", 0.80, "coexpression"),
    ("CYP3A4", "CYP2C9", 0.83, "coexpression"),
    ("CYP3A4", "CYP2C19", 0.81, "coexpression"),
    ("CYP3A4", "CYP19A1", 0.55, "coexpression"),
    ("CYP3A4", "CYP17A1", 0.52, "coexpression"),
    ("CYP2D6", "CYP2C9", 0.79, "coexpression"),
    ("CYP2D6", "CYP2C19", 0.78, "coexpression"),
    ("CYP2D6", "CYP2E1", 0.76, "coexpression"),
    ("CYP1A2", "CYP2E1", 0.78, "coexpression"),
    ("CYP1A2", "AHR", 0.82, "activation"),
    ("CYP2C9", "CYP2C19", 0.92, "binding"),
    ("CYP2C9", "CYP2E1", 0.74, "coexpression"),

    # Phase II metabolism + transporters
    ("CYP3A4", "UGT1A1", 0.72, "reaction"),
    ("CYP2D6", "UGT1A1", 0.65, "reaction"),
    ("UGT1A1", "SULT1A1", 0.70, "coexpression"),
    ("CYP3A4", "ABCB1", 0.75, "reaction"),
    ("CYP2D6", "ABCB1", 0.60, "reaction"),
    ("ABCB1", "ALB", 0.50, "binding"),
    ("UGT1A1", "ABCB1", 0.62, "reaction"),
    ("CYP3A4", "ALB", 0.55, "binding"),

    # Lipoxygenase / eicosanoid metabolism
    ("ALOX5", "ALOX15", 0.88, "binding"),
    ("ALOX5", "PTGS2", 0.72, "coexpression"),
    ("ALOX15", "PTGS2", 0.68, "coexpression"),
    ("ALOX5", "PTGS1", 0.65, "coexpression"),
    ("ALOX5", "CYP2E1", 0.45, "coexpression"),

    # AHR (Aryl Hydrocarbon Receptor) network
    ("AHR", "CYP1A2", 0.82, "activation"),
    ("AHR", "CYP3A4", 0.55, "activation"),
    ("AHR", "NQO1", 0.68, "activation"),

    # Nuclear receptors → CYP induction
    ("PPARG", "CYP2E1", 0.48, "activation"),
    ("PPARG", "HMGCR", 0.58, "activation"),

    # Protease / ACE pathway
    ("ACE", "MMP9", 0.55, "coexpression"),
    ("MMP9", "CTSD", 0.62, "coexpression"),

    # Phosphodiesterase
    ("PDE4A", "PDE5A", 0.88, "binding"),
    ("ADORA2A", "PDE4A", 0.70, "activation"),
    ("ADORA2A", "DRD2", 0.65, "binding"),

    # Cholinesterase
    ("ACHE", "BCHE", 0.95, "binding"),

    # Carbonic anhydrase / Ion channels
    ("CA2", "CA9", 0.90, "binding"),
    ("CA2", "SCN5A", 0.45, "coexpression"),

    # Cross-pathway links
    ("EGFR", "ESR1", 0.55, "coexpression"),
    ("MAPK1", "PTGS2", 0.75, "activation"),
    ("SRC", "ABL1", 0.90, "binding"),
    ("HMGCR", "AKR1B1", 0.50, "coexpression"),
    ("NQO1", "CYP1A2", 0.65, "coexpression"),
]


def _local_ppi_network(genes: List[str]) -> List[Dict[str, Any]]:
    """Build PPI edges from curated interactions for the given gene set."""
    gene_set = set(g.upper() for g in genes)
    edges = []

    for gA, gB, score, itype in CURATED_PPI:
        if gA.upper() in gene_set and gB.upper() in gene_set:
            edges.append({
                "preferredName_A": gA,
                "preferredName_B": gB,
                "score": score,
                "interaction_type": itype,
                "source": "curated_local",
            })

    return edges


# ═══════════════════════════════════════════════════════════════
#  Graph Analysis (pure Python — no networkx dependency required)
# ═══════════════════════════════════════════════════════════════

def _compute_graph_metrics(nodes: List[str], edges: List[Dict[str, Any]]
                           ) -> Dict[str, Any]:
    """
    Compute basic graph topology metrics without external graph library.
    - Degree centrality
    - Betweenness centrality (approximation via BFS)
    - Clustering coefficient
    - Connected components
    - Hub genes (top-5 by degree)
    """
    # Build adjacency list
    adj: Dict[str, Set[str]] = defaultdict(set)
    for e in edges:
        a = e.get("preferredName_A", "")
        b = e.get("preferredName_B", "")
        if a and b:
            adj[a].add(b)
            adj[b].add(a)

    node_set = set(nodes)
    for n in node_set:
        if n not in adj:
            adj[n] = set()

    n = len(node_set)
    if n == 0:
        return {"hub_genes": [], "density": 0, "clusters": [], "degree_centrality": {}}

    # Degree centrality
    degree_cent = {}
    for node in node_set:
        degree_cent[node] = len(adj[node]) / max(n - 1, 1)
    degree_cent = dict(sorted(degree_cent.items(), key=lambda x: x[1], reverse=True))

    # Graph density
    num_edges = len(edges)
    max_edges = n * (n - 1) / 2
    density = num_edges / max_edges if max_edges > 0 else 0

    # BFS-based betweenness approximation
    betweenness: Dict[str, float] = {node: 0.0 for node in node_set}

    def bfs_shortest_paths(source: str):
        """BFS from source, tracking all shortest paths."""
        dist = {source: 0}
        num_paths = {source: 1}
        stack = []
        queue = [source]
        predecessors: Dict[str, List[str]] = defaultdict(list)

        while queue:
            v = queue.pop(0)
            stack.append(v)
            for w in adj[v]:
                if w not in dist:
                    dist[w] = dist[v] + 1
                    queue.append(w)
                if dist.get(w, float("inf")) == dist[v] + 1:
                    num_paths[w] = num_paths.get(w, 0) + num_paths[v]
                    predecessors[w].append(v)

        return stack, predecessors, num_paths

    # Brandes-like accumulation (limited to small graphs for performance)
    if n <= 200:
        for s in node_set:
            stack, preds, npaths = bfs_shortest_paths(s)
            dependency = {v: 0.0 for v in node_set}
            while stack:
                w = stack.pop()
                for v in preds.get(w, []):
                    ratio = npaths.get(v, 1) / max(npaths.get(w, 1), 1)
                    dependency[v] += ratio * (1 + dependency[w])
                if w != s:
                    betweenness[w] += dependency[w]

        # Normalize
        norm = max((n - 1) * (n - 2), 1)
        betweenness = {k: round(v / norm, 4) for k, v in betweenness.items()}

    betweenness = dict(sorted(betweenness.items(), key=lambda x: x[1], reverse=True))

    # Connected components (BFS)
    visited: Set[str] = set()
    components = []
    for node in node_set:
        if node not in visited:
            comp: List[str] = []
            queue = [node]
            while queue:
                v = queue.pop(0)
                if v in visited:
                    continue
                visited.add(v)
                comp.append(v)
                for w in adj[v]:
                    if w not in visited:
                        queue.append(w)
            components.append(sorted(comp))

    components.sort(key=len, reverse=True)

    # Hub genes (top 5 by degree)
    hub_genes = list(degree_cent.keys())[:5]

    # Clustering coefficient (global transitivity)
    triangles = 0
    triples = 0
    for nd in node_set:
        nbrs = list(adj[nd])
        k = len(nbrs)
        if k < 2:
            continue
        triples += k * (k - 1) // 2
        for i in range(k):
            for j in range(i + 1, k):
                if nbrs[j] in adj[nbrs[i]]:
                    triangles += 1
    clustering_coefficient = round(triangles / triples, 4) if triples > 0 else 0.0

    # Average degree
    avg_degree = round((2 * num_edges) / n, 2) if n > 0 else 0.0

    return {
        "hub_genes": hub_genes,
        "density": round(density, 4),
        "num_nodes": n,
        "num_edges": num_edges,
        "connected_components": len(components),
        "largest_component_size": len(components[0]) if components else 0,
        "largest_component_fraction": round(len(components[0]) / n, 4) if components and n > 0 else 0.0,
        "clustering_coefficient": clustering_coefficient,
        "avg_degree": avg_degree,
        "clusters": components[:10],  # top 10 components
        "degree_centrality": {k: round(v, 4) for k, v in list(degree_cent.items())[:30]},
        "betweenness_centrality": {k: v for k, v in list(betweenness.items())[:30]},
    }


# ═══════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════

def build_ppi_network(genes: List[str], min_score: int = 400
                      ) -> Dict[str, Any]:
    """
    Build a protein–protein interaction network for the given genes.

    Args:
        genes: List of gene symbols (e.g., ["EGFR", "BRAF", "MAPK1"])
        min_score: Minimum STRING interaction score (0-1000)

    Returns:
        {
            "nodes": [{id, label, degree, ...}],
            "edges": [{source, target, score, ...}],
            "metrics": {hub_genes, density, clusters, ...},
            "source": "string_db" | "curated_local",
        }
    """
    if not genes:
        return {"nodes": [], "edges": [], "metrics": {}, "source": "none", "error": "No genes provided"}

    # Deduplicate and uppercase
    gene_list = list(dict.fromkeys(g.upper() for g in genes))

    # Try STRING DB first
    string_edges = _query_string_interactions(gene_list, min_score)
    source = "string_db"

    if string_edges is None or len(string_edges) == 0:
        # Fallback to local curated
        string_edges = _local_ppi_network(gene_list)
        source = "curated_local"

    # Collect all node names from edges + input genes
    node_names = set(gene_list)
    for e in string_edges:
        node_names.add(e.get("preferredName_A", ""))
        node_names.add(e.get("preferredName_B", ""))
    node_names.discard("")

    # Build edge list for output
    edges_out = []
    for e in string_edges:
        a = e.get("preferredName_A", e.get("stringId_A", ""))
        b = e.get("preferredName_B", e.get("stringId_B", ""))
        score = e.get("score", 0)
        # STRING returns scores as 0-1; curated uses 0-1 too
        if isinstance(score, (int, float)) and score > 1:
            score = score / 1000  # STRING API returns 0-1000 scale

        edges_out.append({
            "source": a,
            "target": b,
            "score": round(score, 3) if isinstance(score, float) else score,
            "interaction_type": e.get("interaction_type", "functional"),
        })

    # Compute graph metrics
    metrics = _compute_graph_metrics(list(node_names), edges_out)

    # Build node list with degree info
    degree_map = defaultdict(int)
    for e in edges_out:
        degree_map[e["source"]] += 1
        degree_map[e["target"]] += 1

    nodes_out = []
    for name in sorted(node_names):
        is_input = name.upper() in [g.upper() for g in gene_list]
        nodes_out.append({
            "id": name,
            "label": name,
            "degree": degree_map.get(name, 0),
            "is_drug_target": is_input,
            "centrality": metrics.get("degree_centrality", {}).get(name, 0),
        })

    nodes_out.sort(key=lambda x: x["degree"], reverse=True)

    return {
        "nodes": nodes_out,
        "edges": edges_out,
        "metrics": metrics,
        "source": source,
        "gene_count": len(node_names),
    }

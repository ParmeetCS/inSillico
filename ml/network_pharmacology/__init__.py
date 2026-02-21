"""
network_pharmacology — Network Pharmacology Engine
====================================================
Multi-target drug analysis: SMILES → Targets → PPI Network → Pathways → Diseases

Modules:
  target_prediction   – 3-tier target prediction (ChEMBL API → FP similarity → SMARTS)
  chembl_client       – ChEMBL REST API integration for real-time target lookup
  similarity_engine   – Local Morgan-FP similarity against approved-drug reference DB
  ppi_network         – Build protein-protein interaction graphs (STRING DB)
  pathway_enrichment  – KEGG/Reactome pathway enrichment (Fisher's exact test)
  disease_mapping     – Disease associations (Open Targets Platform)

Data sources:
  ChEMBL 34           – 2.4 M compounds, 15.5 M activities (CC BY-SA 3.0)
  DrugBank (curated)  – FDA-approved drug-target interactions
  STRING 11.5         – Protein-protein interactions
  Reactome / KEGG     – Biological pathway databases
  Open Targets        – Disease-gene association platform
"""

from network_pharmacology.target_prediction import predict_targets
from network_pharmacology.ppi_network import build_ppi_network
from network_pharmacology.pathway_enrichment import enrich_pathways
from network_pharmacology.disease_mapping import map_diseases
from network_pharmacology.disease_inference import (
    run_disease_inference,
    filter_targets_by_confidence,
    assess_network_coherence,
)

__all__ = [
    "predict_targets",
    "build_ppi_network",
    "enrich_pathways",
    "map_diseases",
    "run_disease_inference",
    "filter_targets_by_confidence",
    "assess_network_coherence",
]

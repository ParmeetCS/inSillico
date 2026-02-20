#!/usr/bin/env python3
"""
build_reference_db.py — Download & Build Reference Drug-Target Database
========================================================================
Downloads approved drug-target interaction data from ChEMBL REST API
and creates/updates the local drug_targets.csv reference database.

Usage:
    python build_reference_db.py               # Download top 500 approved drugs
    python build_reference_db.py --limit 1000  # Download more

Data Source:
    ChEMBL database (https://www.ebi.ac.uk/chembl/)
    License: CC BY-SA 3.0

Output:
    data/drug_targets.csv — Reference database of drug-target interactions
    Each row: drug_name, smiles, gene_symbol, target_name, uniprot_id,
              target_class, pchembl_value, source
"""

import csv
import os
import sys
import time
import argparse
import requests
from typing import List, Dict, Any

CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data"
API_TIMEOUT = 20
RATE_LIMIT = 0.5  # seconds between requests

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "drug_targets.csv")


def fetch_approved_drugs(limit: int = 500) -> List[Dict[str, Any]]:
    """Fetch approved drugs from ChEMBL."""
    print(f"Fetching up to {limit} approved drugs from ChEMBL...")
    drugs = []
    offset = 0
    page_size = 100

    while offset < limit:
        try:
            url = f"{CHEMBL_BASE}/molecule.json"
            params = {
                "max_phase": 4,  # Approved drugs only
                "molecule_type": "Small molecule",
                "limit": min(page_size, limit - offset),
                "offset": offset,
            }
            resp = requests.get(url, params=params, timeout=API_TIMEOUT)
            if resp.status_code != 200:
                print(f"  HTTP {resp.status_code} at offset {offset}, stopping")
                break

            data = resp.json()
            mols = data.get("molecules", [])
            if not mols:
                break

            for mol in mols:
                smiles = (mol.get("molecule_structures") or {}).get("canonical_smiles", "")
                name = mol.get("pref_name", "")
                chembl_id = mol.get("molecule_chembl_id", "")
                if smiles and name:
                    drugs.append({
                        "chembl_id": chembl_id,
                        "name": name,
                        "smiles": smiles,
                    })

            offset += len(mols)
            print(f"  Fetched {len(drugs)} drugs so far...")
            time.sleep(RATE_LIMIT)

        except Exception as e:
            print(f"  Error at offset {offset}: {e}")
            break

    print(f"Total approved drugs with SMILES: {len(drugs)}")
    return drugs


def fetch_activities_for_drug(chembl_id: str) -> List[Dict[str, Any]]:
    """Fetch bioactivity data for a single drug."""
    try:
        url = f"{CHEMBL_BASE}/activity.json"
        params = {
            "molecule_chembl_id": chembl_id,
            "target_type": "SINGLE PROTEIN",
            "target_organism": "Homo sapiens",
            "pchembl_value__gte": 5.0,
            "limit": 50,
        }
        resp = requests.get(url, params=params, timeout=API_TIMEOUT)
        if resp.status_code != 200:
            return []

        return resp.json().get("activities", [])

    except Exception:
        return []


def resolve_target(target_chembl_id: str) -> Dict[str, str]:
    """Resolve a ChEMBL target ID to gene symbol and UniProt."""
    try:
        url = f"{CHEMBL_BASE}/target/{target_chembl_id}.json"
        resp = requests.get(url, timeout=API_TIMEOUT)
        if resp.status_code != 200:
            return {}

        data = resp.json()
        components = data.get("target_components", [])
        for comp in components:
            accession = comp.get("accession", "")
            synonyms = comp.get("target_component_synonyms", [])
            gene = ""
            for syn in synonyms:
                if syn.get("syn_type") == "GENE_SYMBOL":
                    gene = syn.get("component_synonym", "")
                    break

            if gene and accession:
                return {
                    "gene_symbol": gene.upper(),
                    "uniprot_id": accession,
                    "target_name": data.get("pref_name", ""),
                    "target_class": data.get("target_type", ""),
                }
        return {}

    except Exception:
        return {}


def build_database(drugs: List[Dict], output_path: str):
    """Build the drug-target CSV from ChEMBL data."""
    print(f"\nBuilding drug-target database...")

    rows = []
    target_cache = {}  # cache resolved targets

    for i, drug in enumerate(drugs):
        print(f"  [{i+1}/{len(drugs)}] {drug['name']}...", end=" ")

        activities = fetch_activities_for_drug(drug["chembl_id"])
        time.sleep(RATE_LIMIT)

        if not activities:
            print("no activities")
            continue

        # Group by target, keep best pChEMBL
        best_by_target = {}
        for act in activities:
            tid = act.get("target_chembl_id", "")
            pchembl = act.get("pchembl_value")
            if tid and pchembl:
                pchembl = float(pchembl)
                if tid not in best_by_target or pchembl > best_by_target[tid]["pchembl"]:
                    best_by_target[tid] = {
                        "pchembl": pchembl,
                        "activity_type": act.get("standard_type", ""),
                    }

        added = 0
        for tid, info in best_by_target.items():
            # Resolve target
            if tid not in target_cache:
                target_cache[tid] = resolve_target(tid)
                time.sleep(RATE_LIMIT)

            target_info = target_cache[tid]
            if not target_info:
                continue

            rows.append({
                "drug_name": drug["name"],
                "smiles": drug["smiles"],
                "gene_symbol": target_info["gene_symbol"],
                "target_name": target_info["target_name"],
                "uniprot_id": target_info["uniprot_id"],
                "target_class": target_info["target_class"],
                "pchembl_value": info["pchembl"],
                "source": "ChEMBL",
            })
            added += 1

        print(f"{added} targets")

    # Write CSV
    print(f"\nWriting {len(rows)} drug-target interactions to {output_path}...")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "drug_name", "smiles", "gene_symbol", "target_name",
            "uniprot_id", "target_class", "pchembl_value", "source"
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done! {len(rows)} interactions for {len(drugs)} drugs.")


def main():
    parser = argparse.ArgumentParser(description="Build drug-target reference DB from ChEMBL")
    parser.add_argument("--limit", type=int, default=500,
                        help="Max approved drugs to download (default: 500)")
    args = parser.parse_args()

    drugs = fetch_approved_drugs(args.limit)
    if not drugs:
        print("No drugs fetched. Check network connectivity.")
        sys.exit(1)

    build_database(drugs, OUTPUT_FILE)


if __name__ == "__main__":
    main()

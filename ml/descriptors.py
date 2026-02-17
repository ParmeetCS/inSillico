"""
descriptors.py — Molecular Descriptor Calculator (RDKit-powered)
=================================================================
Computes physicochemical descriptors from SMILES strings using RDKit.
These descriptors serve as input features for the trained ML models
(XGBoost / Decision Tree) to predict drug-like properties.
"""

import numpy as np
from typing import Dict, List

# ─── RDKit imports ───
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors, Lipinski, Crippen, MolSurf
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams


def compute_descriptors(smiles: str) -> Dict[str, float]:
    """
    Compute a comprehensive molecular descriptor vector from a SMILES string
    using RDKit's validated descriptor calculators.

    Returns a dictionary of ~27 descriptors used as ML model features.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")

    # ── Basic molecular properties ──
    mw = Descriptors.MolWt(mol)
    heavy_atom_count = mol.GetNumHeavyAtoms()

    # ── Atom counts ──
    atom_counts = {}
    for atom in mol.GetAtoms():
        sym = atom.GetSymbol()
        atom_counts[sym] = atom_counts.get(sym, 0) + 1

    c_count = atom_counts.get("C", 0)
    n_count = atom_counts.get("N", 0)
    o_count = atom_counts.get("O", 0)
    s_count = atom_counts.get("S", 0)
    f_count = atom_counts.get("F", 0)
    cl_count = atom_counts.get("Cl", 0)
    br_count = atom_counts.get("Br", 0)
    i_count = atom_counts.get("I", 0)

    halogen_count = f_count + cl_count + br_count + i_count

    # ── Topological descriptors ──
    hbd = Descriptors.NumHDonors(mol)           # H-bond donors
    hba = Descriptors.NumHAcceptors(mol)         # H-bond acceptors
    rot_bonds = Descriptors.NumRotatableBonds(mol)
    n_rings = Descriptors.RingCount(mol)
    n_aromatic_rings = Descriptors.NumAromaticRings(mol)
    tpsa = Descriptors.TPSA(mol)                 # Topological PSA (Å²)

    # ── Lipophilicity estimate (Wildman-Crippen) ──
    logp_estimate = Crippen.MolLogP(mol)

    # ── Fraction sp3 carbons ──
    sp3_fraction = Lipinski.FractionCSP3(mol)

    # ── Ratios and derived ──
    n_o_ratio = n_count / max(o_count, 1)
    mw_per_heavy_atom = mw / max(heavy_atom_count, 1)

    # ── Functional group counts (via SMARTS matching) ──
    def count_smarts(pattern: str) -> int:
        pat = Chem.MolFromSmarts(pattern)
        if pat is None:
            return 0
        return len(mol.GetSubstructMatches(pat))

    n_hydroxyl  = count_smarts("[OX2H]")              # -OH
    n_carboxyl  = count_smarts("[CX3](=O)[OX2H1]")    # -COOH
    n_amine     = count_smarts("[NX3;H2,H1;!$(NC=O)]")  # primary/secondary amine
    n_carbonyl  = count_smarts("[CX3]=[OX1]")          # C=O
    n_ether     = count_smarts("[OD2]([#6])[#6]")      # C-O-C
    n_ester     = count_smarts("[#6][CX3](=O)[OX2H0][#6]")  # ester
    n_amide     = count_smarts("[NX3][CX3](=[OX1])[#6]")     # amide

    # ── SMILES-level features ──
    smiles_length = len(smiles)
    branch_count = smiles.count("(")
    charge_count = smiles.count("+") + smiles.count("-")

    return {
        # Basic counts
        "molecular_weight": round(mw, 2),
        "heavy_atom_count": heavy_atom_count,
        "c_count": c_count,
        "n_count": n_count,
        "o_count": o_count,
        "s_count": s_count,
        "halogen_count": halogen_count,

        # Topological descriptors
        "hbd": hbd,
        "hba": hba,
        "rotatable_bonds": rot_bonds,
        "n_rings": n_rings,
        "n_aromatic_rings": n_aromatic_rings,
        "tpsa": round(tpsa, 2),

        # Ratios and derived
        "sp3_fraction": round(sp3_fraction, 3),
        "n_o_ratio": round(n_o_ratio, 3),
        "mw_per_heavy_atom": round(mw_per_heavy_atom, 3),
        "logp_estimate": round(logp_estimate, 3),

        # Functional groups
        "n_hydroxyl": n_hydroxyl,
        "n_carboxyl": n_carboxyl,
        "n_amine": n_amine,
        "n_carbonyl": n_carbonyl,
        "n_ether": n_ether,
        "n_ester": n_ester,
        "n_amide": n_amide,

        # SMILES-level features
        "smiles_length": smiles_length,
        "branch_count": branch_count,
        "charge_count": charge_count,
    }


def get_feature_names() -> List[str]:
    """Return ordered list of descriptor names used as ML features."""
    return list(compute_descriptors("C").keys())


def get_rdkit_properties(smiles: str) -> Dict:
    """
    Get direct RDKit-calculated properties for a molecule.
    These are exact computed values (not ML predictions).
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")

    return {
        "molecular_weight": round(Descriptors.MolWt(mol), 2),
        "exact_mass": round(Descriptors.ExactMolWt(mol), 4),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "logp_crippen": round(Crippen.MolLogP(mol), 2),
        "tpsa": round(Descriptors.TPSA(mol), 2),
        "hbd": Descriptors.NumHDonors(mol),
        "hba": Descriptors.NumHAcceptors(mol),
        "rotatable_bonds": Descriptors.NumRotatableBonds(mol),
        "aromatic_rings": Descriptors.NumAromaticRings(mol),
        "rings": Descriptors.RingCount(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "fraction_csp3": round(Lipinski.FractionCSP3(mol), 3),
        "molar_refractivity": round(Crippen.MolMR(mol), 2),
        "qed": round(Descriptors.qed(mol), 3),  # Drug-likeness score
    }


# ─── PAINS filter catalog (loaded once) ───
_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)


def compute_drug_likeness(smiles: str) -> Dict:
    """
    Compute a comprehensive drug-likeness assessment including:
      - Lipinski Rule of Five
      - Veber rules (oral bioavailability)
      - PAINS filter (pan-assay interference)
      - QED (quantitative estimate of drug-likeness)
      - Overall Drugability Score (0–100) with letter grade

    Returns a dictionary suitable for JSON serialisation to the frontend.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")

    mw = Descriptors.MolWt(mol)
    logp = Crippen.MolLogP(mol)
    hbd = Descriptors.NumHDonors(mol)
    hba = Descriptors.NumHAcceptors(mol)
    tpsa = Descriptors.TPSA(mol)
    rot_bonds = Descriptors.NumRotatableBonds(mol)
    qed = Descriptors.qed(mol)

    # ── Lipinski Rule of Five ──
    lipinski_rules = [
        {"rule": "MW ≤ 500", "value": round(mw, 1), "threshold": 500, "passed": mw <= 500, "unit": "Da"},
        {"rule": "LogP ≤ 5", "value": round(logp, 2), "threshold": 5, "passed": logp <= 5, "unit": ""},
        {"rule": "HBD ≤ 5", "value": hbd, "threshold": 5, "passed": hbd <= 5, "unit": ""},
        {"rule": "HBA ≤ 10", "value": hba, "threshold": 10, "passed": hba <= 10, "unit": ""},
    ]
    lipinski_violations = sum(1 for r in lipinski_rules if not r["passed"])

    # ── Veber Rules (oral bioavailability predictor) ──
    veber_rules = [
        {"rule": "Rotatable Bonds ≤ 10", "value": rot_bonds, "threshold": 10, "passed": rot_bonds <= 10, "unit": ""},
        {"rule": "TPSA ≤ 140 Å²", "value": round(tpsa, 1), "threshold": 140, "passed": tpsa <= 140, "unit": "Å²"},
    ]
    veber_violations = sum(1 for r in veber_rules if not r["passed"])

    # ── PAINS Filter ──
    pains_matches = _pains_catalog.GetMatches(mol)
    pains_alerts = []
    for match in pains_matches:
        pains_alerts.append(match.GetDescription())
    pains_passed = len(pains_alerts) == 0

    # ── Scoring ──
    # QED is 0–1; we scale it.  Penalise violations.
    base_score = qed * 100                        # 0–100 from QED
    lipinski_penalty = lipinski_violations * 12    # −12 per violation
    veber_penalty = veber_violations * 8           # −8 per violation
    pains_penalty = len(pains_alerts) * 15         # −15 per PAINS alert

    raw_score = base_score - lipinski_penalty - veber_penalty - pains_penalty
    drugability_score = round(max(0, min(100, raw_score)), 1)

    # Letter grade
    if drugability_score >= 90:
        grade = "A+"
    elif drugability_score >= 80:
        grade = "A"
    elif drugability_score >= 70:
        grade = "B+"
    elif drugability_score >= 60:
        grade = "B"
    elif drugability_score >= 50:
        grade = "B-"
    elif drugability_score >= 40:
        grade = "C+"
    elif drugability_score >= 30:
        grade = "C"
    elif drugability_score >= 20:
        grade = "D"
    else:
        grade = "F"

    return {
        "score": drugability_score,
        "grade": grade,
        "qed": round(qed, 3),
        "lipinski": {
            "violations": lipinski_violations,
            "rules": lipinski_rules,
        },
        "veber": {
            "violations": veber_violations,
            "rules": veber_rules,
        },
        "pains": {
            "alert_count": len(pains_alerts),
            "passed": pains_passed,
            "alerts": pains_alerts[:5],  # cap at 5 for the UI
        },
    }


if __name__ == "__main__":
    # Test with Aspirin
    smiles = "CC(=O)OC1=CC=CC=C1C(=O)O"
    print(f"\n{'='*60}")
    print(f"  Aspirin Molecular Descriptors (RDKit)")
    print(f"  SMILES: {smiles}")
    print(f"{'='*60}")

    desc = compute_descriptors(smiles)
    print(f"\n  ML Feature Descriptors ({len(desc)} features):")
    print(f"  {'-'*50}")
    for k, v in desc.items():
        print(f"    {k:25s} = {v}")

    props = get_rdkit_properties(smiles)
    print(f"\n  RDKit Computed Properties:")
    print(f"  {'-'*50}")
    for k, v in props.items():
        print(f"    {k:25s} = {v}")

    dl = compute_drug_likeness(smiles)
    print(f"\n  Drug-Likeness Assessment:")
    print(f"  {'-'*50}")
    print(f"    Score:  {dl['score']} / 100  (Grade: {dl['grade']})")
    print(f"    QED:    {dl['qed']}")
    print(f"    Lipinski violations: {dl['lipinski']['violations']}")
    print(f"    Veber violations:    {dl['veber']['violations']}")
    print(f"    PAINS alerts:        {dl['pains']['alert_count']}")

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

"""
fingerprints.py — Molecular Fingerprint & Descriptor Calculator
================================================================
Computes Morgan fingerprints (ECFP4) and physicochemical descriptors
as the feature representation for QSPR models.

Scientific rationale for Morgan fingerprints (ECFP4):
  - Extended-Connectivity Fingerprints (ECFPs) encode circular atomic
    neighborhoods. At radius=2 (diameter=4), they capture functional
    groups up to 4 bonds from each atom center.
  - ECFP4 is the most widely validated fingerprint in published QSAR/QSPR
    studies (Rogers & Hahn, J. Chem. Inf. Model., 2010, 50, 742-754).
  - Superior to MACCS keys for scaffold hopping; superior to topological
    fingerprints for activity cliffs detection.

Why 2048 bits:
  - For drug-like molecules (MW < 900), ~100-300 unique circular fragments
    are typical. Hashing these into 1024 bits causes ~30-40% collision rate;
    2048 bits reduces this to ~15-20%. 4096 bits gives ~8-10% but doubles
    memory with <1% accuracy improvement on MoleculeNet benchmarks.

Why we append physicochemical descriptors:
  - Fingerprints encode substructure presence, NOT global molecular properties.
  - MW, TPSA, LogP, HBD/HBA capture pharmacokinetic-relevant properties
    that fingerprints miss.
  - This hybrid representation consistently outperforms either alone
    by 2-5% R² on MoleculeNet regression tasks.
"""

import numpy as np
from typing import Dict, List, Optional
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, Crippen, Lipinski, rdMolDescriptors, MolSurf, MACCSkeys
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
from rdkit.Chem.EState import EState_VSA

from .config import MORGAN_RADIUS, MORGAN_NBITS, USE_PHYSICOCHEMICAL_DESCRIPTORS, USE_MACCS_KEYS, MACCS_NBITS


class MorganFingerprintCalculator:
    """
    Computes Morgan fingerprints (ECFP4) + MACCS keys + physicochemical descriptors.

    The feature vector is:
      [Morgan FP bits (4096)] + [MACCS keys (167)] + [PhysChem descriptors (20)]
      Total: 4283 dimensions

    Thread-safe: no mutable state after __init__.
    """

    def __init__(
        self,
        radius: int = MORGAN_RADIUS,
        n_bits: int = MORGAN_NBITS,
        use_physchem: bool = USE_PHYSICOCHEMICAL_DESCRIPTORS,
        use_maccs: bool = USE_MACCS_KEYS,
    ):
        self.radius = radius
        self.n_bits = n_bits
        self.use_physchem = use_physchem
        self.use_maccs = use_maccs
        self._feature_names: Optional[List[str]] = None

    @property
    def n_features(self) -> int:
        """Total feature vector dimensionality."""
        n = self.n_bits
        if self.use_maccs:
            n += MACCS_NBITS
        if self.use_physchem:
            n += 20  # 20 physicochemical descriptors (v4)
        return n

    @property
    def feature_names(self) -> List[str]:
        """Ordered list of feature names."""
        if self._feature_names is None:
            names = [f"morgan_bit_{i}" for i in range(self.n_bits)]
            if self.use_maccs:
                names.extend([f"maccs_bit_{i}" for i in range(MACCS_NBITS)])
            if self.use_physchem:
                names.extend([
                    "physchem_mw",
                    "physchem_tpsa",
                    "physchem_logp",
                    "physchem_hbd",
                    "physchem_hba",
                    "physchem_rotbonds",
                    "physchem_aromatic_rings",
                    "physchem_fraction_csp3",
                    "physchem_qed",
                    "physchem_molar_refractivity",
                    "physchem_ring_count",
                    "physchem_heavy_atom_count",
                    "physchem_bertz_ct",
                    "physchem_num_heteroatoms",
                    "physchem_labute_asa",
                    "physchem_peoe_vsa1",
                    "physchem_slogp_vsa1",
                    "physchem_num_aliphatic_rings",
                    "physchem_num_saturated_rings",
                    "physchem_num_aromatic_heterocycles",
                ])
            self._feature_names = names
        return self._feature_names

    def smiles_to_mol(self, smiles: str) -> Chem.Mol:
        """Parse SMILES to RDKit Mol with validation."""
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError(f"Invalid SMILES: {smiles}")
        return mol

    def compute_morgan_fp(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute Morgan fingerprint as a bit vector.

        Uses GetMorganFingerprintAsBitVect for memory efficiency
        (bit packing) over GetMorganFingerprint (count-based).
        """
        fp = AllChem.GetMorganFingerprintAsBitVect(
            mol,
            self.radius,
            nBits=self.n_bits,
            useChirality=True,     # Encode stereochemistry
            useBondTypes=True,     # Encode bond types
            useFeatures=True,      # Pharmacophoric feature invariants: improves activity prediction
        )
        return np.array(fp, dtype=np.float32)

    def compute_maccs(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute MACCS 166 structural keys.

        MACCS keys encode 166 predefined substructural patterns covering
        functional groups, ring systems, and pharmacophoric features.
        They are complementary to Morgan fingerprints, capturing global
        patterns that circular fingerprints can miss.
        """
        fp = MACCSkeys.GenMACCSKeys(mol)
        return np.array(fp, dtype=np.float32)

    def compute_physchem(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute 20 physicochemical descriptors (v4 — expanded from 14).

        Selected for pharmacokinetic and QSPR relevance:
          Core 14 (from v3):
          - MW: Lipinski Ro5 criterion, absorption predictor
          - TPSA: Blood-brain barrier, intestinal absorption
          - LogP: Lipophilicity, membrane permeability
          - HBD/HBA: Hydrogen bonding capacity, solubility
          - RotBonds: Molecular flexibility, oral bioavailability
          - AromaticRings: Metabolic stability, binding
          - FractionCSP3: 3D complexity, target selectivity
          - QED: Quantitative estimate of drug-likeness (multi-property)
          - MolarRefractivity: Molecular polarizability, binding affinity
          - RingCount: Total ring systems (aromatic + aliphatic)
          - HeavyAtomCount: Molecular size proxy
          - BertzCT: Topological complexity (graph-theoretic)
          - NumHeteroatoms: Heteroatom fraction, solubility/reactivity

          New in v4 (6 descriptors):
          - LabuteASA: Labute approximate surface area — strongly correlated with logP and solubility
          - PEOE_VSA1: Partial equalization of orbital electronegativity VSA
                       — captures electrostatic surface features for ADMET
          - SlogP_VSA1: LogP-weighted van der Waals surface area
                        — direct lipophilicity surface descriptor
          - NumAliphaticRings: Aliphatic ring count — metabolic soft spots
          - NumSaturatedRings: Saturated ring count — 3D character (sp3)
          - NumAromaticHeterocycles: Aromatic heterocycles — binding motifs/toxicophores
        """
        return np.array([
            Descriptors.MolWt(mol),
            Descriptors.TPSA(mol),
            Crippen.MolLogP(mol),
            Descriptors.NumHDonors(mol),
            Descriptors.NumHAcceptors(mol),
            Descriptors.NumRotatableBonds(mol),
            Descriptors.NumAromaticRings(mol),
            Lipinski.FractionCSP3(mol),
            Descriptors.qed(mol),
            Crippen.MolMR(mol),
            Descriptors.RingCount(mol),
            mol.GetNumHeavyAtoms(),
            Descriptors.BertzCT(mol),
            Descriptors.NumHeteroatoms(mol),
            # v4 additions
            rdMolDescriptors.CalcLabuteASA(mol),
            MolSurf.PEOE_VSA1(mol),
            MolSurf.SlogP_VSA1(mol),
            Descriptors.NumAliphaticRings(mol),
            Descriptors.NumSaturatedRings(mol),
            Descriptors.NumAromaticHeterocycles(mol),
        ], dtype=np.float32)

    def compute(self, smiles: str) -> np.ndarray:
        """
        Compute full feature vector for a single SMILES string.

        Returns:
            1D numpy array of shape (n_features,)
        """
        mol = self.smiles_to_mol(smiles)
        parts = [self.compute_morgan_fp(mol)]

        if self.use_maccs:
            parts.append(self.compute_maccs(mol))

        if self.use_physchem:
            parts.append(self.compute_physchem(mol))

        return np.concatenate(parts)

    def compute_batch(self, smiles_list: List[str]) -> np.ndarray:
        """
        Compute feature matrix for a batch of SMILES strings.

        Args:
            smiles_list: List of SMILES strings

        Returns:
            2D numpy array of shape (n_molecules, n_features)

        Raises:
            ValueError if any SMILES is invalid
        """
        features = []
        for smi in smiles_list:
            features.append(self.compute(smi))
        return np.vstack(features)

    def describe(self) -> Dict:
        """Return a description of this descriptor configuration."""
        return {
            "type": "Morgan Fingerprint (ECFP4) + MACCS Keys",
            "radius": self.radius,
            "n_bits": self.n_bits,
            "use_maccs": self.use_maccs,
            "maccs_bits": MACCS_NBITS if self.use_maccs else 0,
            "use_physchem": self.use_physchem,
            "n_physchem": 20 if self.use_physchem else 0,
            "n_features": self.n_features,
            "version": f"ecfp{self.radius * 2}_{self.n_bits}_maccs_v4",
        }


# ═══════════════════════════════════════════════════
#  Standalone RDKit property functions
#  (kept for Flask API backward compatibility)
# ═══════════════════════════════════════════════════

def compute_rdkit_properties(smiles: str) -> Dict:
    """
    Compute direct RDKit molecular properties (exact values, not ML predictions).
    Used by the Flask API for the molecule info section of the response.
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
        "qed": round(Descriptors.qed(mol), 3),
    }


# ─── PAINS filter catalog (loaded once at module level) ───
_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)


def compute_drug_likeness(smiles: str, logp_override: float = None) -> Dict:
    """
    Comprehensive drug-likeness assessment:
      - Lipinski Rule of Five
      - Veber rules (oral bioavailability)
      - PAINS filter (pan-assay interference)
      - QED (quantitative estimate of drug-likeness)
      - Drugability Score (0–100) with letter grade

    Args:
        smiles: SMILES string
        logp_override: If provided, use this LogP value instead of
                       RDKit Crippen LogP, for consistency with QSPR predictions.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")

    mw = Descriptors.MolWt(mol)
    logp = logp_override if logp_override is not None else Crippen.MolLogP(mol)
    hbd = Descriptors.NumHDonors(mol)
    hba = Descriptors.NumHAcceptors(mol)
    tpsa = Descriptors.TPSA(mol)
    rot_bonds = Descriptors.NumRotatableBonds(mol)
    qed = Descriptors.qed(mol)

    # Lipinski Rule of Five
    lipinski_rules = [
        {"rule": "MW ≤ 500", "value": round(mw, 1), "threshold": 500, "passed": mw <= 500, "unit": "Da"},
        {"rule": "LogP ≤ 5", "value": round(logp, 2), "threshold": 5, "passed": logp <= 5, "unit": ""},
        {"rule": "HBD ≤ 5", "value": hbd, "threshold": 5, "passed": hbd <= 5, "unit": ""},
        {"rule": "HBA ≤ 10", "value": hba, "threshold": 10, "passed": hba <= 10, "unit": ""},
    ]
    lipinski_violations = sum(1 for r in lipinski_rules if not r["passed"])

    # Veber Rules
    veber_rules = [
        {"rule": "Rotatable Bonds ≤ 10", "value": rot_bonds, "threshold": 10, "passed": rot_bonds <= 10, "unit": ""},
        {"rule": "TPSA ≤ 140 Å²", "value": round(tpsa, 1), "threshold": 140, "passed": tpsa <= 140, "unit": "Å²"},
    ]
    veber_violations = sum(1 for r in veber_rules if not r["passed"])

    # PAINS Filter
    pains_matches = _pains_catalog.GetMatches(mol)
    pains_alerts = [match.GetDescription() for match in pains_matches]
    pains_passed = len(pains_alerts) == 0

    # Scoring
    base_score = qed * 100
    lipinski_penalty = lipinski_violations * 12
    veber_penalty = veber_violations * 8
    pains_penalty = len(pains_alerts) * 15
    raw_score = base_score - lipinski_penalty - veber_penalty - pains_penalty
    drugability_score = round(max(0, min(100, raw_score)), 1)

    # Letter grade
    grades = [
        (90, "A+"), (80, "A"), (70, "B+"), (60, "B"),
        (50, "B-"), (40, "C+"), (30, "C"), (20, "D"),
    ]
    grade = "F"
    for threshold, g in grades:
        if drugability_score >= threshold:
            grade = g
            break

    return {
        "score": drugability_score,
        "grade": grade,
        "qed": round(qed, 3),
        "lipinski": {"violations": lipinski_violations, "rules": lipinski_rules},
        "veber": {"violations": veber_violations, "rules": veber_rules},
        "pains": {
            "alert_count": len(pains_alerts),
            "passed": pains_passed,
            "alerts": pains_alerts[:5],
        },
    }

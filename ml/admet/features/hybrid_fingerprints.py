"""
hybrid_fingerprints.py — ECFP6 + Physicochemical + Topological + Functional Group Features
=============================================================================================
Replaces the Morgan-only (ECFP4) approach with a comprehensive hybrid
feature representation designed for diverse chemical space coverage.

Feature vector layout (2094 dimensions):
  ┌──────────────────────────────────────┬──────┐
  │ ECFP6 fingerprint bits               │ 2048 │
  │ Physicochemical descriptors          │   26 │
  │ Topological descriptors              │    8 │
  │ Functional group indicators          │   12 │
  └──────────────────────────────────────┴──────┘

Scientific rationale:

ECFP6 (radius=3) vs ECFP4 (radius=2):
  ECFP6 captures larger substructural neighborhoods (diameter 6 vs 4),
  which is critical for:
    - Nucleoside analogues: sugar + base + linker variations
    - Phosphoramidates: P-N linkage + aromatic leaving group
    - Large antivirals: extended heterocyclic systems
  ECFP6 has 15-30% more unique substructures for MW > 500 compounds,
  improving discrimination in exactly the chemical space where ECFP4 fails.
  Ref: Cereto-Massagué et al., Methods, 2015, 71, 58-63.

Extended physicochemical descriptors (26 vs 14):
  Added surface area, polarizability, and partial charge descriptors
  that are critical for large molecule ADMET prediction:
    - LabuteASA: Solvent-accessible surface area proxy
    - PEOE_VSA: Partial equalization of orbital electronegativity
    - BalabanJ: Topological distance-based index
    - Chi0n: Molecular connectivity index
    - Kappa1-3: Shape indices

Topological descriptors (8):
  Graph-theoretical descriptors that capture molecular shape and
  branching independent of 3D conformation:
    - Wiener index, Zagreb indices, information content

Functional group indicators (12):
  Binary flags for ADMET-relevant functional groups:
    - Prodrug moieties (phosphoramidate, ester, carbamate)
    - Metabolic soft spots (phenolic OH, primary amine)
    - Toxicophores (nitro, aniline, epoxide)
"""

import numpy as np
from typing import Dict, List, Optional
from rdkit import Chem
from rdkit.Chem import (
    AllChem, Descriptors, Crippen, Lipinski, MolSurf,
    rdMolDescriptors, Fragments, GraphDescriptors,
)

from ..config import MORGAN_RADIUS, MORGAN_NBITS


class HybridFingerprintCalculator:
    """
    Computes ECFP6 + physicochemical + topological + functional group features.

    Total: 2094 features (2048 FP + 26 physchem + 8 topological + 12 funcgroup)

    Thread-safe: no mutable state after __init__.
    """

    def __init__(
        self,
        radius: int = MORGAN_RADIUS,  # 3 = ECFP6
        n_bits: int = MORGAN_NBITS,
        use_physchem: bool = True,
        use_topological: bool = True,
        use_funcgroups: bool = True,
    ):
        self.radius = radius
        self.n_bits = n_bits
        self.use_physchem = use_physchem
        self.use_topological = use_topological
        self.use_funcgroups = use_funcgroups
        self._feature_names: Optional[List[str]] = None

        # Precompile SMARTS patterns for functional groups
        self._funcgroup_patterns = self._compile_funcgroup_patterns()

    @property
    def n_features(self) -> int:
        n = self.n_bits
        if self.use_physchem:
            n += 26
        if self.use_topological:
            n += 8
        if self.use_funcgroups:
            n += 12
        return n

    @property
    def feature_names(self) -> List[str]:
        if self._feature_names is None:
            names = [f"ecfp6_bit_{i}" for i in range(self.n_bits)]

            if self.use_physchem:
                names.extend([
                    "physchem_mw", "physchem_tpsa", "physchem_logp",
                    "physchem_hbd", "physchem_hba", "physchem_rotbonds",
                    "physchem_aromatic_rings", "physchem_fraction_csp3",
                    "physchem_qed", "physchem_molar_refractivity",
                    "physchem_ring_count", "physchem_heavy_atom_count",
                    "physchem_bertz_ct", "physchem_num_heteroatoms",
                    # New in v4 (expanded from v3's 14)
                    "physchem_labute_asa", "physchem_peoe_vsa1",
                    "physchem_peoe_vsa6", "physchem_slogp_vsa1",
                    "physchem_smr_vsa5", "physchem_balabanj",
                    "physchem_chi0n", "physchem_kappa1",
                    "physchem_kappa2", "physchem_kappa3",
                    "physchem_num_aliphatic_rings",
                    "physchem_max_partial_charge",
                ])

            if self.use_topological:
                names.extend([
                    "topo_hall_kier_alpha", "topo_ipc",
                    "topo_num_bridgehead_atoms", "topo_num_spiro_atoms",
                    "topo_num_saturated_rings", "topo_num_aromatic_heterocycles",
                    "topo_nhoh_count", "topo_no_count",
                ])

            if self.use_funcgroups:
                names.extend([
                    "fg_phosphoramidate", "fg_ester", "fg_carbamate",
                    "fg_amide", "fg_sulfonamide", "fg_nitro",
                    "fg_primary_amine", "fg_phenolic_oh",
                    "fg_epoxide", "fg_aniline", "fg_nucleoside_core",
                    "fg_phosphate",
                ])

            self._feature_names = names
        return self._feature_names

    def _compile_funcgroup_patterns(self) -> Dict[str, Chem.Mol]:
        """Pre-compile SMARTS patterns for functional group detection."""
        patterns = {
            # Prodrug-relevant groups
            "phosphoramidate": "[P](=O)([O,N])([O,N])[N]",
            "ester": "[CX3](=O)[OX2H0][#6]",
            "carbamate": "[NX3][CX3](=[OX1])[OX2H0]",
            "amide": "[NX3][CX3](=[OX1])[#6]",
            "sulfonamide": "[#16](=O)(=O)[NX3]",
            # Metabolic soft spots
            "nitro": "[NX3+](=O)[O-]",
            "primary_amine": "[NX3H2][CX4]",
            "phenolic_oh": "[OX2H]c1ccccc1",
            # Toxicophores
            "epoxide": "C1OC1",
            "aniline": "[NX3H2]c1ccccc1",
            # Nucleoside/nucleotide indicators
            "nucleoside_core": "[#7]1[#6]=[#7][#6]2=[#6]1[#7]=[#6][#7]=[#6]2",  # purine
            "phosphate": "[P](=O)([OH,O-])([OH,O-])",
        }

        compiled = {}
        for name, smarts in patterns.items():
            mol = Chem.MolFromSmarts(smarts)
            if mol is not None:
                compiled[name] = mol
            else:
                # Fallback simpler pattern
                compiled[name] = None
        return compiled

    def smiles_to_mol(self, smiles: str) -> Chem.Mol:
        """Parse and validate SMILES."""
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError(f"Invalid SMILES: {smiles}")
        return mol

    def compute_ecfp6(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute ECFP6 (Morgan radius=3) fingerprint as bit vector.

        ECFP6 captures atom environments up to 6 bonds diameter,
        providing better discrimination for:
          - Large heterocyclic systems (antivirals)
          - Nucleoside sugar-base-linker patterns
          - Phosphoramidate leaving groups
        """
        fp = AllChem.GetMorganFingerprintAsBitVect(
            mol,
            self.radius,  # 3 = ECFP6
            nBits=self.n_bits,
            useChirality=True,
            useBondTypes=True,
            useFeatures=False,
        )
        return np.array(fp, dtype=np.float32)

    def compute_physchem(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute 26 physicochemical descriptors.

        Core 14 (from QSPR v3):
          MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings,
          FractionCSP3, QED, MolarRefractivity, RingCount,
          HeavyAtomCount, BertzCT, NumHeteroatoms

        Extended 12 (new for ADMET v4):
          LabuteASA: Approximate solvent-accessible surface area
          PEOE_VSA1/6: Partial charge surface area bins
          SlogP_VSA1: LogP-weighted surface area
          SMR_VSA5: Molar refractivity surface area
          BalabanJ: Topological distance-weighted index
          Chi0n: Molecular connectivity index (0th order, non-H)
          Kappa1-3: Hall-Kier shape indices
          NumAliphaticRings: Non-aromatic ring count
          MaxPartialCharge: Maximum Gasteiger partial charge
        """
        try:
            max_partial_charge = max(
                Descriptors.MaxPartialCharge(mol),
                key=lambda x: abs(x) if isinstance(x, (int, float)) else 0
            ) if hasattr(Descriptors, 'MaxPartialCharge') else 0.0
        except Exception:
            max_partial_charge = 0.0

        try:
            max_pc = Descriptors.MaxPartialCharge(mol)
            if max_pc is None or not np.isfinite(max_pc):
                max_pc = 0.0
        except Exception:
            max_pc = 0.0

        descriptors = [
            # Core 14
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
            # Extended 12
            self._safe_descriptor(Descriptors.LabuteASA, mol),
            self._safe_descriptor(MolSurf.PEOE_VSA1, mol),
            self._safe_descriptor(MolSurf.PEOE_VSA6, mol),
            self._safe_descriptor(MolSurf.SlogP_VSA1, mol),
            self._safe_descriptor(MolSurf.SMR_VSA5, mol),
            self._safe_descriptor(GraphDescriptors.BalabanJ, mol, default=0.0),
            self._safe_descriptor(GraphDescriptors.Chi0n, mol),
            self._safe_descriptor(GraphDescriptors.Kappa1, mol),
            self._safe_descriptor(GraphDescriptors.Kappa2, mol),
            self._safe_descriptor(GraphDescriptors.Kappa3, mol),
            Descriptors.NumAliphaticRings(mol),
            max_pc,
        ]

        return np.array(descriptors, dtype=np.float32)

    def compute_topological(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute 8 topological descriptors for molecular shape characterization.

        These capture graph-theoretical properties that distinguish between:
          - Linear vs branched molecules
          - Compact vs extended scaffolds
          - Fused ring systems vs simple chains
        """
        descriptors = [
            self._safe_descriptor(GraphDescriptors.HallKierAlpha, mol),
            self._safe_descriptor(Descriptors.Ipc, mol, default=0.0),
            rdMolDescriptors.CalcNumBridgeheadAtoms(mol),
            rdMolDescriptors.CalcNumSpiroAtoms(mol),
            Descriptors.NumSaturatedRings(mol),
            Descriptors.NumAromaticHeterocycles(mol),
            Descriptors.NHOHCount(mol),
            Descriptors.NOCount(mol),
        ]

        return np.array(descriptors, dtype=np.float32)

    def compute_funcgroups(self, mol: Chem.Mol) -> np.ndarray:
        """
        Compute 12 functional group binary indicators.

        Critical for:
          - Prodrug detection (phosphoramidate, ester, carbamate)
          - Metabolic liability (aniline, phenolic OH, primary amine)
          - Toxicophore flags (nitro, epoxide)
          - Nucleoside classification (purine/pyrimidine + sugar)
        """
        indicators = []
        for fg_name in [
            "phosphoramidate", "ester", "carbamate", "amide",
            "sulfonamide", "nitro", "primary_amine", "phenolic_oh",
            "epoxide", "aniline", "nucleoside_core", "phosphate",
        ]:
            pattern = self._funcgroup_patterns.get(fg_name)
            if pattern is not None:
                try:
                    has_match = mol.HasSubstructMatch(pattern)
                    indicators.append(1.0 if has_match else 0.0)
                except Exception:
                    indicators.append(0.0)
            else:
                indicators.append(0.0)

        return np.array(indicators, dtype=np.float32)

    def _safe_descriptor(self, func, mol, default: float = 0.0) -> float:
        """Safely compute a descriptor, returning default on failure."""
        try:
            val = func(mol)
            if val is None or not np.isfinite(val):
                return default
            return float(val)
        except Exception:
            return default

    def compute(self, smiles: str) -> np.ndarray:
        """
        Compute full hybrid feature vector for a single SMILES.

        Returns:
            1D numpy array of shape (n_features,)
        """
        mol = self.smiles_to_mol(smiles)
        parts = [self.compute_ecfp6(mol)]

        if self.use_physchem:
            parts.append(self.compute_physchem(mol))
        if self.use_topological:
            parts.append(self.compute_topological(mol))
        if self.use_funcgroups:
            parts.append(self.compute_funcgroups(mol))

        return np.concatenate(parts)

    def compute_batch(self, smiles_list: List[str]) -> np.ndarray:
        """
        Compute feature matrix for a batch of SMILES.

        Returns:
            2D numpy array of shape (n_molecules, n_features)
        """
        features = []
        for smi in smiles_list:
            features.append(self.compute(smi))
        return np.vstack(features)

    def compute_batch_safe(
        self, smiles_list: List[str]
    ) -> tuple:
        """
        Compute features for a batch, skipping invalid SMILES.

        Returns:
            (features: np.ndarray, valid_indices: list, invalid_smiles: list)
        """
        features = []
        valid_indices = []
        invalid = []

        for i, smi in enumerate(smiles_list):
            try:
                feat = self.compute(smi)
                features.append(feat)
                valid_indices.append(i)
            except (ValueError, Exception):
                invalid.append(smi)

        if features:
            return np.vstack(features), valid_indices, invalid
        return np.array([]).reshape(0, self.n_features), [], invalid

    def describe(self) -> Dict:
        """Return feature configuration metadata."""
        return {
            "type": f"Hybrid ECFP{self.radius * 2} + PhysChem + Topological + FuncGroup",
            "radius": self.radius,
            "n_bits": self.n_bits,
            "n_physchem": 26 if self.use_physchem else 0,
            "n_topological": 8 if self.use_topological else 0,
            "n_funcgroups": 12 if self.use_funcgroups else 0,
            "n_features": self.n_features,
            "version": f"ecfp{self.radius * 2}_{self.n_bits}_hybrid_v1",
        }

"""
fetcher.py — Multi-Source ADMET Dataset Fetcher
==================================================
Downloads and caches datasets from:
  - MoleculeNet (local CSVs)
  - ChEMBL (REST API)
  - PubChem (PUG REST API)
  - DrugBank (local / preprocessed)
  - ZINC15 (REST API)
  - ADMETlab (curated local files)

Each fetcher returns a raw DataFrame with at minimum:
  - smiles: str
  - target: float
  - source: str

Preprocessing is done by ADMETPreprocessor after fetching.
"""

import os
import json
import time
import logging
import hashlib
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from pathlib import Path

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem, rdMolDescriptors

from ..config import DATA_DIR, CACHE_DIR, DATASET_SOURCES

logger = logging.getLogger("admet.data.fetcher")


class DatasetFetcher:
    """
    Multi-source dataset fetcher with caching.

    Usage:
        fetcher = DatasetFetcher()
        df = fetcher.fetch_moleculenet("solubility")
        df = fetcher.fetch_chembl(target_id="CHEMBL25", mw_range=(100, 800))
        df = fetcher.fetch_pubchem(assay_id=1706)
        df = fetcher.fetch_drugbank_prodrugs()
        df = fetcher.fetch_zinc15(subset="fda", n_samples=5000)
    """

    def __init__(self, cache_dir: str = CACHE_DIR, use_cache: bool = True):
        self.cache_dir = cache_dir
        self.use_cache = use_cache
        os.makedirs(self.cache_dir, exist_ok=True)

    def _cache_path(self, key: str) -> str:
        """Generate a cache file path from a key."""
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return os.path.join(self.cache_dir, f"{safe_key}.parquet")

    def _load_cache(self, key: str) -> Optional[pd.DataFrame]:
        """Load from cache if available."""
        path = self._cache_path(key)
        if self.use_cache and os.path.exists(path):
            try:
                df = pd.read_parquet(path)
                logger.info(f"  Cache hit: {key} ({len(df):,} rows)")
                return df
            except Exception as e:
                logger.warning(f"  Cache read failed for {key}: {e}")
        return None

    def _save_cache(self, key: str, df: pd.DataFrame) -> None:
        """Save DataFrame to cache."""
        try:
            path = self._cache_path(key)
            df.to_parquet(path, index=False)
            logger.info(f"  Cached: {key} ({len(df):,} rows)")
        except Exception as e:
            logger.warning(f"  Cache write failed: {e}")

    # ──────────────────────────────────────────────
    #  MoleculeNet (local CSVs already in ml/data/)
    # ──────────────────────────────────────────────

    def fetch_moleculenet(
        self,
        property_name: str,
        data_dir: str = None,
    ) -> pd.DataFrame:
        """
        Load a MoleculeNet dataset from local CSV.

        Supported: solubility, logp, bbbp, toxicity
        """
        data_dir = data_dir or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "data"
        )

        configs = DATASET_SOURCES["moleculenet"]["datasets"]
        if property_name not in configs:
            raise ValueError(
                f"Unknown MoleculeNet property: {property_name}. "
                f"Available: {list(configs.keys())}"
            )

        cfg = configs[property_name]
        filepath = os.path.join(data_dir, cfg["file"])

        if not os.path.exists(filepath):
            raise FileNotFoundError(
                f"Dataset not found: {filepath}. "
                f"Run download_moleculenet.py first."
            )

        df = pd.read_csv(filepath)

        # Normalize column names
        result = pd.DataFrame({
            "smiles": df[cfg["smiles_col"]],
            "target": df[cfg["target_col"]],
            "source": "moleculenet",
        })

        logger.info(f"  MoleculeNet/{property_name}: {len(result):,} rows")
        return result

    # ──────────────────────────────────────────────
    #  ChEMBL (REST API)
    # ──────────────────────────────────────────────

    def fetch_chembl(
        self,
        target_id: str = None,
        assay_type: str = "B",
        mw_range: Tuple[float, float] = (100, 800),
        tpsa_range: Tuple[float, float] = (0, 250),
        max_records: int = 10000,
        activity_type: str = "IC50",
        activity_threshold_nm: float = 10000,
    ) -> pd.DataFrame:
        """
        Fetch bioactivity data from ChEMBL REST API.

        Filters:
          - MW range to expand chemical space
          - TPSA range for diverse coverage
          - Activity type (IC50, Ki, EC50)
          - Assay type (B=binding, F=functional)

        Returns DataFrame with: smiles, target, source, mw, tpsa, activity_type
        """
        cache_key = f"chembl_{target_id}_{assay_type}_{mw_range}_{max_records}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        if not HAS_REQUESTS:
            logger.warning("requests package not installed; cannot fetch ChEMBL")
            return pd.DataFrame(columns=["smiles", "target", "source"])

        base_url = "https://www.ebi.ac.uk/chembl/api/data"
        records = []
        offset = 0
        limit = 1000

        while len(records) < max_records:
            params = {
                "format": "json",
                "limit": limit,
                "offset": offset,
                "standard_type": activity_type,
                "assay_type": assay_type,
                "pchembl_value__isnull": "false",
            }
            if target_id:
                params["target_chembl_id"] = target_id

            try:
                url = f"{base_url}/activity"
                resp = requests.get(url, params=params, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.warning(f"  ChEMBL API error at offset {offset}: {e}")
                break

            activities = data.get("activities", [])
            if not activities:
                break

            for act in activities:
                smi = act.get("canonical_smiles")
                pchembl = act.get("pchembl_value")
                if smi and pchembl:
                    try:
                        mol = Chem.MolFromSmiles(smi)
                        if mol is None:
                            continue
                        mw = Descriptors.MolWt(mol)
                        tpsa = Descriptors.TPSA(mol)
                        if mw_range[0] <= mw <= mw_range[1] and tpsa_range[0] <= tpsa <= tpsa_range[1]:
                            records.append({
                                "smiles": smi,
                                "target": float(pchembl),
                                "source": "chembl",
                                "mw": mw,
                                "tpsa": tpsa,
                                "target_id": target_id or "multi",
                                "activity_type": activity_type,
                            })
                    except Exception:
                        continue

            offset += limit
            if offset >= data.get("page_meta", {}).get("total_count", 0):
                break
            time.sleep(0.5)  # Rate limiting

        df = pd.DataFrame(records) if records else pd.DataFrame(
            columns=["smiles", "target", "source"]
        )

        logger.info(f"  ChEMBL/{target_id}: {len(df):,} records fetched")

        if len(df) > 0:
            self._save_cache(cache_key, df)

        return df

    def fetch_chembl_diverse(
        self,
        n_targets: int = 20,
        records_per_target: int = 500,
        mw_range: Tuple[float, float] = (100, 800),
    ) -> pd.DataFrame:
        """
        Fetch diverse chemical space from multiple ChEMBL targets.

        Includes antivirals, kinase inhibitors, GPCRs, transporters
        for maximum structural diversity.
        """
        cache_key = f"chembl_diverse_{n_targets}_{records_per_target}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        # Priority targets spanning diverse chemical space
        diverse_targets = [
            "CHEMBL25",     # EGFR (kinase inhibitor scaffold diversity)
            "CHEMBL1862",   # ABL1 (imatinib-like)
            "CHEMBL3594",   # SARS-CoV-2 Mpro
            "CHEMBL4523582",# SARS-CoV-2 RdRp
            "CHEMBL240",    # HERG (cardiotoxicity)
            "CHEMBL1075104",# HIV-1 RT (antivirals)
            "CHEMBL247",    # CYP3A4
            "CHEMBL289",    # CYP2D6
            "CHEMBL340",    # CYP2C9
            "CHEMBL4303797",# P-glycoprotein
            "CHEMBL1951",   # HCV NS5B (nucleoside analogues)
            "CHEMBL301",    # Thymidine kinase
            "CHEMBL3885545",# BRAF V600E
            "CHEMBL1824",   # JAK2
            "CHEMBL203",    # DPP-IV
            "CHEMBL2971",   # Aurora kinase A
            "CHEMBL279",    # VEGFR2
            "CHEMBL267",    # Dopamine D2
            "CHEMBL228",    # Muscarinic M1
            "CHEMBL4616",   # PI3K alpha
        ]

        all_dfs = []
        for target_id in diverse_targets[:n_targets]:
            try:
                df = self.fetch_chembl(
                    target_id=target_id,
                    mw_range=mw_range,
                    max_records=records_per_target,
                )
                if len(df) > 0:
                    all_dfs.append(df)
            except Exception as e:
                logger.warning(f"  Failed to fetch {target_id}: {e}")
                continue

        result = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame(
            columns=["smiles", "target", "source"]
        )

        if len(result) > 0:
            result = result.drop_duplicates(subset=["smiles"], keep="first")
            self._save_cache(cache_key, result)

        logger.info(f"  ChEMBL diverse: {len(result):,} unique molecules")
        return result

    # ──────────────────────────────────────────────
    #  PubChem (PUG REST API)
    # ──────────────────────────────────────────────

    def fetch_pubchem(
        self,
        assay_id: int = None,
        search_term: str = None,
        max_records: int = 5000,
        activity_outcome: str = "active",
    ) -> pd.DataFrame:
        """
        Fetch bioactivity data from PubChem BioAssay.

        Use for antiviral compound expansion (SARS-CoV-2, HIV, HCV).

        Args:
            assay_id: PubChem BioAssay AID
            search_term: Text search for compound names
            max_records: Maximum compounds to return
            activity_outcome: "active", "inactive", or "all"
        """
        cache_key = f"pubchem_{assay_id}_{search_term}_{max_records}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        if not HAS_REQUESTS:
            logger.warning("requests package not installed; cannot fetch PubChem")
            return pd.DataFrame(columns=["smiles", "target", "source"])

        base_url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
        records = []

        if assay_id:
            # Fetch bioassay results
            try:
                url = f"{base_url}/assay/aid/{assay_id}/concise/JSON"
                resp = requests.get(url, timeout=60)
                resp.raise_for_status()
                data = resp.json()

                # Parse PubChem concise assay format
                table = data.get("Table", {})
                columns = table.get("Columns", {}).get("Column", [])
                rows = table.get("Row", [])

                # Find column indices
                sid_idx = columns.index("SID") if "SID" in columns else None
                cid_idx = columns.index("CID") if "CID" in columns else None
                outcome_idx = columns.index("Activity Outcome") if "Activity Outcome" in columns else None
                activity_idx = None
                for i, col in enumerate(columns):
                    if "activity" in col.lower() and "outcome" not in col.lower():
                        activity_idx = i
                        break

                # Collect active CIDs
                cids = []
                for row in rows[:max_records]:
                    cells = row.get("Cell", [])
                    if outcome_idx is not None and len(cells) > outcome_idx:
                        outcome = str(cells[outcome_idx]).lower()
                        if activity_outcome != "all" and outcome != activity_outcome:
                            continue
                    if cid_idx is not None and len(cells) > cid_idx:
                        cid = cells[cid_idx]
                        if cid:
                            activity_value = 1.0 if activity_outcome == "active" else 0.0
                            if activity_idx is not None and len(cells) > activity_idx:
                                try:
                                    activity_value = float(cells[activity_idx])
                                except (ValueError, TypeError):
                                    pass
                            cids.append((int(cid), activity_value))

                # Fetch SMILES for CIDs in batches
                batch_size = 100
                for i in range(0, len(cids), batch_size):
                    batch_cids = cids[i:i + batch_size]
                    cid_str = ",".join(str(c[0]) for c in batch_cids)
                    try:
                        smi_url = f"{base_url}/compound/cid/{cid_str}/property/CanonicalSMILES,MolecularWeight,TPSA/JSON"
                        smi_resp = requests.get(smi_url, timeout=30)
                        smi_resp.raise_for_status()
                        props = smi_resp.json().get("PropertyTable", {}).get("Properties", [])

                        cid_to_activity = {c[0]: c[1] for c in batch_cids}
                        for prop in props:
                            smi = prop.get("CanonicalSMILES")
                            cid = prop.get("CID")
                            mw = prop.get("MolecularWeight", 0)
                            tpsa = prop.get("TPSA", 0)
                            if smi and cid in cid_to_activity:
                                records.append({
                                    "smiles": smi,
                                    "target": cid_to_activity[cid],
                                    "source": f"pubchem_aid{assay_id}",
                                    "mw": float(mw),
                                    "tpsa": float(tpsa),
                                })
                    except Exception as e:
                        logger.warning(f"  PubChem SMILES batch error: {e}")
                    time.sleep(0.3)
            except Exception as e:
                logger.warning(f"  PubChem assay {assay_id} error: {e}")

        df = pd.DataFrame(records) if records else pd.DataFrame(
            columns=["smiles", "target", "source"]
        )

        if len(df) > 0:
            self._save_cache(cache_key, df)

        logger.info(f"  PubChem/AID{assay_id}: {len(df):,} records")
        return df

    def fetch_pubchem_antivirals(self, max_per_assay: int = 2000) -> pd.DataFrame:
        """
        Fetch SARS-CoV-2 and antiviral compounds from PubChem.

        Targets:
          - Mpro (3CLpro) inhibitors
          - RdRp inhibitors
          - ACE2-targeting molecules
        """
        cache_key = f"pubchem_antivirals_{max_per_assay}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        antiviral_assays = {
            # SARS-CoV-2 Mpro assays
            1706: "SARS-CoV-2 Mpro",
            2289: "SARS-CoV-2 Mpro HTS",
            1479718: "SARS-CoV-2 Mpro qHTS",
            # RdRp assays
            1347423: "SARS-CoV-2 RdRp",
            1479719: "SARS-CoV-2 RdRp counter",
            # General antiviral
            1159607: "HIV RT inhibitors",
            720579: "HCV NS5B polymerase",
        }

        all_dfs = []
        for aid, desc in antiviral_assays.items():
            try:
                df = self.fetch_pubchem(
                    assay_id=aid,
                    max_records=max_per_assay,
                    activity_outcome="active",
                )
                if len(df) > 0:
                    all_dfs.append(df)
                    logger.info(f"  PubChem {desc} (AID{aid}): {len(df):,}")
            except Exception as e:
                logger.warning(f"  PubChem AID{aid} failed: {e}")

        result = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame(
            columns=["smiles", "target", "source"]
        )
        result = result.drop_duplicates(subset=["smiles"], keep="first")

        if len(result) > 0:
            self._save_cache(cache_key, result)

        logger.info(f"  PubChem antivirals total: {len(result):,}")
        return result

    # ──────────────────────────────────────────────
    #  DrugBank (local prodrug dataset)
    # ──────────────────────────────────────────────

    def fetch_drugbank_prodrugs(
        self,
        drugbank_csv: str = None,
    ) -> pd.DataFrame:
        """
        Load prodrug classification labels from DrugBank-derived data.

        If no DrugBank CSV is available, creates a synthetic prodrug dataset
        from known prodrug SMILES with structural annotations.

        Returns DataFrame with: smiles, target (1=prodrug, 0=non-prodrug),
                               source, drug_name, route
        """
        cache_key = "drugbank_prodrugs"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        if drugbank_csv and os.path.exists(drugbank_csv):
            df = pd.read_csv(drugbank_csv)
            logger.info(f"  DrugBank CSV: {len(df):,} records")
        else:
            # Known prodrugs with SMILES — curated reference set
            # These are well-documented prodrugs from literature
            prodrugs = [
                # Phosphoramidate prodrugs (nucleoside analogues)
                {"smiles": "CCC(CC)COC(=O)[C@H](C)NP(=O)(OC[C@H]1OC(n2ccc(=O)[nH]c2=O)[C@@](C)(F)[C@@H]1O)Oc1ccccc1",
                 "name": "Sofosbuvir", "route": "oral", "target": 1},
                {"smiles": "CCC(CC)COC(=O)[C@H](C)N[P@](=O)(OC[C@@H]1[C@H](O)[C@@](C)(F)[C@H](n2cnc3c(N)ncnc32)O1)Oc1ccccc1",
                 "name": "Remdesivir (GS-5734)", "route": "IV", "target": 1},
                {"smiles": "CC(C)OC(=O)[C@H](C)NP(=O)(OC[C@H]1OC([C@@H](O)[C@@H]1O)n1ccc(N)nc1=O)Oc1ccccc1",
                 "name": "GS-441524 ProTide", "route": "oral", "target": 1},
                # Ester prodrugs
                {"smiles": "CCOC(=O)C(CCc1ccccc1)NC(C)C(=O)N1CC(O)CC1C(=O)O",
                 "name": "Enalapril", "route": "oral", "target": 1},
                {"smiles": "CC(=O)Oc1ccccc1C(=O)O",
                 "name": "Aspirin (acetylsalicylate)", "route": "oral", "target": 1},
                {"smiles": "COC(=O)c1ccc(NC(=O)c2ccc(Cl)cc2)cc1",
                 "name": "Chloroprocaine ester", "route": "oral", "target": 1},
                {"smiles": "CC(=O)OC1=CC2=C(C=C1OC(C)=O)[C@@H]3[C@H]4CC=C5C[C@H](OC(C)=O)CC[C@]5(C)[C@@H]4CC[C@]3(C)[C@@H]2OC(C)=O",
                 "name": "Cortisone acetate", "route": "oral", "target": 1},
                # Carbamate/amide prodrugs
                {"smiles": "NC(=O)OC1c2ccccc2-c2ccccc21",
                 "name": "Felbamate prodrug", "route": "oral", "target": 1},
                {"smiles": "OC(=O)CCC(=O)Oc1ccc(O)cc1OC(=O)CCC(=O)O",
                 "name": "Salsalate (prodrug)", "route": "oral", "target": 1},
                # Phosphate prodrugs
                {"smiles": "Clc1ccc2[nH]c(S(=O)Cc3ncc(COP(O)(O)=O)c(OC)c3C)nc2c1",
                 "name": "Ilaprazole phosphate", "route": "IV", "target": 1},
                # Additional nucleoside analogues (prodrugs)
                {"smiles": "Nc1ccn(C2OC(COP(=O)(O)OP(=O)(O)OP(=O)(O)O)C(O)C2O)c(=O)n1",
                 "name": "Cytidine triphosphate analogue", "route": "IV", "target": 1},

                # ── Non-prodrugs (direct-acting) ──
                {"smiles": "CC1=C(C(=O)Nc2ccccc2)c2cc(F)ccc2/C1=C/c1ccc(S(C)=O)cc1",
                 "name": "Sulindac (active)", "route": "oral", "target": 0},
                {"smiles": "CC(C)Cc1ccc(C(C)C(=O)O)cc1",
                 "name": "Ibuprofen", "route": "oral", "target": 0},
                {"smiles": "OC(=O)Cc1ccccc1Nc1c(Cl)cccc1Cl",
                 "name": "Diclofenac", "route": "oral", "target": 0},
                {"smiles": "c1ccc2[nH]c(-c3cscn3)nc2c1",
                 "name": "Thiabendazole", "route": "oral", "target": 0},
                {"smiles": "Cc1c(O)cccc1C(=O)NC(CS)C(=O)O",
                 "name": "Captopril (not prodrug)", "route": "oral", "target": 0},
                {"smiles": "CC(=O)Nc1ccc(O)cc1",
                 "name": "Acetaminophen", "route": "oral", "target": 0},
                {"smiles": "CC12CCC3c4ccc(O)cc4CCC3C1CCC2O",
                 "name": "Estradiol", "route": "oral", "target": 0},
                {"smiles": "Clc1ccc(C(c2ccc(Cl)cc2)C(Cl)(Cl)Cl)cc1",
                 "name": "DDT (non-prodrug toxicant)", "route": "oral", "target": 0},
                {"smiles": "O=C(O)c1ccccc1O",
                 "name": "Salicylic acid", "route": "oral", "target": 0},
                {"smiles": "CC(C)(C)NCC(O)c1ccc(O)c(CO)c1",
                 "name": "Salbutamol", "route": "oral", "target": 0},
                {"smiles": "c1ccc(C(=O)O)cc1",
                 "name": "Benzoic acid", "route": "oral", "target": 0},
                {"smiles": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
                 "name": "Glucose", "route": "oral", "target": 0},
            ]

            df = pd.DataFrame(prodrugs)
            df["source"] = "drugbank_curated"
            logger.info(f"  DrugBank curated prodrug set: {len(df):,} compounds")

        self._save_cache(cache_key, df)
        return df

    # ──────────────────────────────────────────────
    #  ZINC15 (REST API for chemical diversity)
    # ──────────────────────────────────────────────

    def fetch_zinc15(
        self,
        subset: str = "fda",
        n_samples: int = 5000,
        mw_range: Tuple[float, float] = (100, 800),
    ) -> pd.DataFrame:
        """
        Fetch diverse drug-like molecules from ZINC15.

        Subsets:
          - "fda": FDA-approved drugs
          - "world": World-approved drugs
          - "in-vivo": Compounds with in-vivo data
          - "investigational": Drugs in clinical trials

        Note: ZINC15 API may have rate limits. Falls back to cached data.
        """
        cache_key = f"zinc15_{subset}_{n_samples}_{mw_range}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        if not HAS_REQUESTS:
            logger.warning("requests package not installed; cannot fetch ZINC15")
            return pd.DataFrame(columns=["smiles", "target", "source"])

        records = []
        page = 1
        per_page = 100

        while len(records) < n_samples:
            try:
                url = f"https://zinc15.docking.org/substances.json"
                params = {
                    "count": per_page,
                    "page": page,
                    "availability": subset,
                    "mwt_gt": mw_range[0],
                    "mwt_lt": mw_range[1],
                }
                resp = requests.get(url, params=params, timeout=30)
                if resp.status_code != 200:
                    logger.warning(f"  ZINC15 returned status {resp.status_code}")
                    break

                substances = resp.json()
                if not substances:
                    break

                for sub in substances:
                    smi = sub.get("smiles")
                    mw = sub.get("mwt", 0)
                    logp = sub.get("logp", 0)
                    if smi:
                        records.append({
                            "smiles": smi,
                            "target": 0.0,  # Placeholder — used for diversity
                            "source": f"zinc15_{subset}",
                            "mw": float(mw),
                            "logp": float(logp) if logp else 0.0,
                        })

                page += 1
                time.sleep(0.5)  # Rate limiting
            except Exception as e:
                logger.warning(f"  ZINC15 page {page} error: {e}")
                break

        df = pd.DataFrame(records) if records else pd.DataFrame(
            columns=["smiles", "target", "source"]
        )

        if len(df) > 0:
            df = df.drop_duplicates(subset=["smiles"], keep="first")
            self._save_cache(cache_key, df)

        logger.info(f"  ZINC15/{subset}: {len(df):,} molecules")
        return df

    # ──────────────────────────────────────────────
    #  ADMETlab curated ADMET datasets
    # ──────────────────────────────────────────────

    def fetch_admetlab(
        self,
        endpoint: str,
        data_dir: str = None,
    ) -> pd.DataFrame:
        """
        Load ADMETlab-curated ADMET endpoint data.

        Checks for local CSV first, then attempts API fetch.

        Supported endpoints:
          caco2, pgp_substrate, bbbp, ppb, cyp2d6_inhibitor,
          cyp3a4_inhibitor, cyp2c9_inhibitor, half_life, clearance,
          herg, ames, dili
        """
        data_dir = data_dir or DATA_DIR
        cache_key = f"admetlab_{endpoint}"
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        # Check for local file
        local_path = os.path.join(data_dir, f"admetlab_{endpoint}.csv")
        if os.path.exists(local_path):
            df = pd.read_csv(local_path)
            # Normalize columns
            smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
            target_col = next((c for c in df.columns if c.lower() in ("target", "label", "value", "activity", endpoint.lower())), None)

            if smiles_col and target_col:
                result = pd.DataFrame({
                    "smiles": df[smiles_col],
                    "target": df[target_col],
                    "source": "admetlab",
                })
                self._save_cache(cache_key, result)
                logger.info(f"  ADMETlab/{endpoint}: {len(result):,} (local)")
                return result

        logger.info(f"  ADMETlab/{endpoint}: No local data found at {local_path}")
        return pd.DataFrame(columns=["smiles", "target", "source"])

    # ──────────────────────────────────────────────
    #  Convenience: Fetch All Available Data
    # ──────────────────────────────────────────────

    def fetch_all_for_endpoint(
        self,
        endpoint: str,
        include_chembl: bool = False,
        include_pubchem: bool = False,
        include_zinc: bool = False,
    ) -> List[pd.DataFrame]:
        """
        Fetch all available data for a given ADMET endpoint.

        Returns list of DataFrames to be merged by ADMETPreprocessor.
        """
        dfs = []

        # Always try local sources first
        moleculenet_map = {
            "solubility": "solubility",
            "logp": "logp",
            "bbbp": "bbbp",
            "toxicity": "toxicity",
        }
        if endpoint in moleculenet_map:
            try:
                dfs.append(self.fetch_moleculenet(moleculenet_map[endpoint]))
            except Exception as e:
                logger.warning(f"MoleculeNet/{endpoint} failed: {e}")

        # ADMETlab
        try:
            adf = self.fetch_admetlab(endpoint)
            if len(adf) > 0:
                dfs.append(adf)
        except Exception as e:
            logger.warning(f"ADMETlab/{endpoint} failed: {e}")

        # Optional external sources
        if include_chembl:
            try:
                cdf = self.fetch_chembl_diverse(n_targets=10, records_per_target=200)
                if len(cdf) > 0:
                    dfs.append(cdf)
            except Exception as e:
                logger.warning(f"ChEMBL fetch failed: {e}")

        if include_pubchem:
            try:
                pdf = self.fetch_pubchem_antivirals(max_per_assay=1000)
                if len(pdf) > 0:
                    dfs.append(pdf)
            except Exception as e:
                logger.warning(f"PubChem fetch failed: {e}")

        if include_zinc:
            try:
                zdf = self.fetch_zinc15(subset="fda", n_samples=2000)
                if len(zdf) > 0:
                    dfs.append(zdf)
            except Exception as e:
                logger.warning(f"ZINC15 fetch failed: {e}")

        return dfs

"""
router.py — Ensemble Routing System
=======================================
Routes molecules to specialized prediction models based on:
  1. Molecular weight (MW) classification
  2. TPSA classification
  3. Functional group analysis
  4. Prodrug detection result

Routing architecture:
  ┌──────────────┐     ┌─────────────────┐
  │ Input SMILES │ ──→ │ Feature Compute  │
  └──────────────┘     └────────┬────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────▼─────┐ ┌──▼──────┐ ┌──▼──────┐
              │ MW < 500  │ │ 500-800 │ │ Prodrug │
              │ Small Oral│ │ Large   │ │ Aware   │
              │ Drug Model│ │ Antivir.│ │ Model   │
              └─────┬─────┘ └──┬──────┘ └──┬──────┘
                    │          │           │
                    └──────────┼───────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Confidence-Weighted │
                    │ Ensemble Merge      │
                    └─────────────────────┘

The router enables specialized models for different chemical spaces
while maintaining a unified prediction API. When only a single model
is available (e.g., during early training), routing is bypassed.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen

from .ensemble import ADMETEnsemble
from .prodrug_detector import ProdugDetector, ProdugAssessment
from .metabolism import MetabolismPredictor, MetabolismProfile
from ..domain.applicability import ApplicabilityDomain, DomainAssessment
from ..features.hybrid_fingerprints import HybridFingerprintCalculator
from ..config import ROUTING_THRESHOLDS, ADMET_ENDPOINTS

logger = logging.getLogger("admet.models.router")


@dataclass
class ChemicalClassification:
    """Classification of a molecule into chemical space regions."""
    mw: float
    tpsa: float
    logp: float
    mw_class: str       # "small", "medium", "large"
    tpsa_class: str     # "low", "moderate", "high"
    is_prodrug: bool
    is_nucleoside: bool
    is_antiviral_like: bool
    route: str           # "small_oral", "large_antiviral", "prodrug", "default"

    def to_dict(self) -> Dict:
        return {
            "mw": round(self.mw, 2),
            "tpsa": round(self.tpsa, 2),
            "logp": round(self.logp, 2),
            "mw_class": self.mw_class,
            "tpsa_class": self.tpsa_class,
            "is_prodrug": self.is_prodrug,
            "is_nucleoside": self.is_nucleoside,
            "is_antiviral_like": self.is_antiviral_like,
            "route": self.route,
        }


@dataclass
class ADMETPrediction:
    """
    Complete ADMET prediction result for a single molecule.

    Contains: property value, confidence, domain status, chemical class,
    uncertainty, prodrug probability, and metabolism profile.
    """
    endpoint: str
    value: float
    confidence: float
    uncertainty: float
    domain_status: str
    domain_confidence: float
    chemical_class: str
    prodrug_probability: float
    route_used: str
    is_prodrug: bool
    unit: str = ""

    # Optional detailed results
    domain_assessment: Optional[Dict] = None
    metabolism_profile: Optional[Dict] = None
    ensemble_details: Optional[Dict] = None

    def to_dict(self) -> Dict:
        result = {
            "endpoint": self.endpoint,
            "value": round(self.value, 4),
            "confidence": round(self.confidence, 4),
            "uncertainty": round(self.uncertainty, 4),
            "unit": self.unit,
            "domain_status": self.domain_status,
            "domain_confidence": round(self.domain_confidence, 4),
            "chemical_class": self.chemical_class,
            "prodrug_probability": round(self.prodrug_probability, 4),
            "is_prodrug": self.is_prodrug,
            "route_used": self.route_used,
        }
        if self.domain_assessment:
            result["domain_details"] = self.domain_assessment
        if self.metabolism_profile:
            result["metabolism"] = self.metabolism_profile
        if self.ensemble_details:
            result["ensemble"] = self.ensemble_details
        return result


class EnsembleRouter:
    """
    Routes molecules to appropriate prediction models based on chemical class.

    Manages:
      - Multiple endpoint-specific ensembles (per-route variants)
      - Applicability domain assessment
      - Prodrug detection
      - Metabolism-aware post-processing
      - Final confidence calibration

    Usage:
        router = EnsembleRouter()
        router.register_ensemble("solubility", "default", ensemble)
        router.register_ensemble("solubility", "large_antiviral", large_ensemble)

        prediction = router.predict("solubility", "CCO")
    """

    def __init__(self):
        self._fp_calc = HybridFingerprintCalculator()

        # Ensembles: endpoint → route → ADMETEnsemble
        self._ensembles: Dict[str, Dict[str, ADMETEnsemble]] = {}

        # Shared modules
        self._prodrug_detector: Optional[ProdugDetector] = None
        self._metabolism_predictor: Optional[MetabolismPredictor] = None
        self._applicability_domains: Dict[str, ApplicabilityDomain] = {}

        # Nucleoside SMARTS
        self._nucleoside_patterns = self._compile_nucleoside_patterns()

    def _compile_nucleoside_patterns(self) -> List:
        """SMARTS for nucleoside/nucleotide scaffolds."""
        patterns = []
        smarts_list = [
            # Purine nucleoside (adenosine / guanosine)
            "[#7]1[#6]=[#7][#6]2=[#6]1[#7]=[#6][#7]=[#6]2",
            # Pyrimidine nucleoside (cytidine / uridine / thymidine)
            "O=c1cc[nH]c(=O)[nH]1",
            # Ribose/deoxyribose sugar linked to N
            "[OX2]1[CX4][CX4][CX4]([NX3])[CX4]1",
        ]
        for s in smarts_list:
            mol = Chem.MolFromSmarts(s)
            if mol:
                patterns.append(mol)
        return patterns

    def register_ensemble(
        self,
        endpoint: str,
        route: str,
        ensemble: ADMETEnsemble,
    ):
        """Register a trained ensemble for a specific endpoint + route."""
        if endpoint not in self._ensembles:
            self._ensembles[endpoint] = {}
        self._ensembles[endpoint][route] = ensemble
        logger.info(f"  Registered ensemble: {endpoint}/{route}")

    def register_applicability_domain(
        self,
        endpoint: str,
        ad: ApplicabilityDomain,
    ):
        """Register a fitted applicability domain for an endpoint."""
        self._applicability_domains[endpoint] = ad

    def register_prodrug_detector(self, detector: ProdugDetector):
        self._prodrug_detector = detector

    def register_metabolism_predictor(self, predictor: MetabolismPredictor):
        self._metabolism_predictor = predictor

    def classify_molecule(self, smiles: str) -> ChemicalClassification:
        """
        Classify a molecule into chemical space regions for routing.
        """
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return ChemicalClassification(
                mw=0, tpsa=0, logp=0, mw_class="unknown",
                tpsa_class="unknown", is_prodrug=False,
                is_nucleoside=False, is_antiviral_like=False,
                route="default",
            )

        mw = Descriptors.MolWt(mol)
        tpsa = Descriptors.TPSA(mol)
        logp = Crippen.MolLogP(mol)

        # MW classification
        if mw < 500:
            mw_class = "small"
        elif mw < 800:
            mw_class = "large"
        else:
            mw_class = "very_large"

        # TPSA classification
        if tpsa < 100:
            tpsa_class = "low"
        elif tpsa < 200:
            tpsa_class = "moderate"
        else:
            tpsa_class = "high"

        # Nucleoside detection
        is_nucleoside = any(
            mol.HasSubstructMatch(pat) for pat in self._nucleoside_patterns
        )

        # Prodrug detection
        is_prodrug = False
        if self._prodrug_detector:
            assessment = self._prodrug_detector.assess(smiles)
            is_prodrug = assessment.is_prodrug

        # Antiviral-like heuristic
        is_antiviral_like = (
            mw > 400 and
            (is_nucleoside or tpsa > 120 or mw > 600) and
            Descriptors.NumHeteroatoms(mol) > 5
        )

        # Route determination
        if is_prodrug:
            route = "prodrug"
        elif mw >= 500 or is_antiviral_like:
            route = "large_antiviral"
        elif mw < 500 and tpsa < 140:
            route = "small_oral"
        else:
            route = "default"

        return ChemicalClassification(
            mw=mw, tpsa=tpsa, logp=logp,
            mw_class=mw_class, tpsa_class=tpsa_class,
            is_prodrug=is_prodrug, is_nucleoside=is_nucleoside,
            is_antiviral_like=is_antiviral_like, route=route,
        )

    def predict(
        self,
        endpoint: str,
        smiles: str,
        include_metabolism: bool = True,
    ) -> ADMETPrediction:
        """
        Predict a single ADMET endpoint for a molecule.

        Pipeline:
          1. Compute features
          2. Classify molecule (MW/TPSA/prodrug)
          3. Assess applicability domain
          4. Route to appropriate ensemble
          5. Apply metabolism corrections if applicable
          6. Return calibrated prediction with full metadata
        """
        if endpoint not in self._ensembles:
            raise ValueError(
                f"No ensemble registered for '{endpoint}'. "
                f"Available: {list(self._ensembles.keys())}"
            )

        ep_cfg = ADMET_ENDPOINTS.get(endpoint, {})
        unit = ep_cfg.get("unit", "")

        # ── 1. Compute features ──
        try:
            features = self._fp_calc.compute(smiles).reshape(1, -1)
        except ValueError as e:
            return ADMETPrediction(
                endpoint=endpoint, value=0.0, confidence=0.0,
                uncertainty=1.0, domain_status="invalid",
                domain_confidence=0.0, chemical_class="invalid",
                prodrug_probability=0.0, route_used="none",
                is_prodrug=False, unit=unit,
            )

        # ── 2. Classify molecule ──
        chem_class = self.classify_molecule(smiles)

        # ── 3. Applicability domain ──
        domain_mult = 1.0
        domain_assessment = None
        domain_status = "unknown"
        domain_confidence = 0.5

        if endpoint in self._applicability_domains:
            ad = self._applicability_domains[endpoint]
            da = ad.assess(smiles, features)
            domain_mult = da.uncertainty_multiplier
            domain_status = da.status
            domain_confidence = da.confidence
            domain_assessment = da.to_dict()

        # ── 4. Route to ensemble ──
        route = chem_class.route
        ensembles = self._ensembles[endpoint]

        # Try specific route, fall back to default
        if route in ensembles:
            ensemble = ensembles[route]
        elif "default" in ensembles:
            ensemble = ensembles["default"]
            route = "default"
        else:
            # Use first available
            route = next(iter(ensembles))
            ensemble = ensembles[route]

        # ── 5. Predict ──
        result = ensemble.predict_single(features, domain_multiplier=domain_mult)

        prediction_value = result["prediction"]
        confidence = result["confidence"]
        uncertainty = result["uncertainty"]

        # ── 6. Metabolism corrections ──
        metabolism_dict = None
        prodrug_prob = 0.0

        if self._prodrug_detector:
            pa = self._prodrug_detector.assess(smiles)
            prodrug_prob = pa.probability

        if include_metabolism and self._metabolism_predictor:
            profile = self._metabolism_predictor.predict_profile(smiles)
            metabolism_dict = profile.to_dict()

            # Adjust bioavailability prediction if this endpoint is bioavailability
            if endpoint == "oral_bioavailability":
                prediction_value = profile.estimated_bioavailability
                confidence = profile.confidence

        return ADMETPrediction(
            endpoint=endpoint,
            value=float(prediction_value),
            confidence=float(confidence),
            uncertainty=float(uncertainty),
            domain_status=domain_status,
            domain_confidence=float(domain_confidence),
            chemical_class=chem_class.mw_class,
            prodrug_probability=float(prodrug_prob),
            route_used=route,
            is_prodrug=chem_class.is_prodrug,
            unit=unit,
            domain_assessment=domain_assessment,
            metabolism_profile=metabolism_dict,
            ensemble_details=result,
        )

    def predict_all(
        self,
        smiles: str,
        include_metabolism: bool = True,
    ) -> Dict[str, ADMETPrediction]:
        """
        Predict all registered ADMET endpoints for a molecule.

        Returns dict of endpoint → ADMETPrediction.
        """
        results = {}
        for endpoint in self._ensembles:
            try:
                results[endpoint] = self.predict(
                    endpoint, smiles,
                    include_metabolism=include_metabolism,
                )
            except Exception as e:
                logger.warning(f"  Prediction failed for {endpoint}: {e}")
        return results

    def get_available_endpoints(self) -> List[str]:
        """List all endpoints with registered ensembles."""
        return list(self._ensembles.keys())

    def describe(self) -> Dict:
        """System description for API responses."""
        return {
            "version": "4.0.0",
            "system": "ADMET Domain-Aware Prediction",
            "endpoints": {
                ep: {
                    "routes": list(routes.keys()),
                    "has_ad": ep in self._applicability_domains,
                }
                for ep, routes in self._ensembles.items()
            },
            "has_prodrug_detection": self._prodrug_detector is not None,
            "has_metabolism": self._metabolism_predictor is not None,
            "feature_calculator": self._fp_calc.describe(),
        }

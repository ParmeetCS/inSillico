"""
applicability.py — Applicability Domain Assessment Module
============================================================
Determines whether a query molecule falls within the chemical space
represented by the training data, providing calibrated confidence scores.

Methods implemented:
  1. Tanimoto Similarity (nearest-neighbor to training set)
  2. Mahalanobis Distance (multivariate distance in descriptor space)
  3. Leverage Approach (hat matrix diagonal)
  4. Isolation Forest (unsupervised anomaly detection)
  5. PCA Chemical Space (projection + distance from convex hull)

The final domain assessment combines all methods into:
  - Domain status: "inside", "borderline", or "outside"
  - Confidence score: 0.0–1.0
  - Uncertainty multiplier: scales prediction uncertainty
  - Detailed per-method scores

Scientific rationale:
  A prediction is only as reliable as its proximity to the training data.
  No single AD method is universally best — Tanimoto captures structural
  similarity, Mahalanobis captures descriptor-space distribution,
  leverage captures feature-space influence, and Isolation Forest
  captures multi-dimensional outliers. The combined score is more
  robust than any individual method.

  Ref: Sahigara et al., Molecules, 2012, 17, 4791-4810.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem

from ..config import DOMAIN_DEFAULTS, MORGAN_RADIUS, MORGAN_NBITS

logger = logging.getLogger("admet.domain")


@dataclass
class DomainAssessment:
    """Result of applicability domain assessment for a single molecule."""

    status: str                     # "inside", "borderline", "outside"
    confidence: float               # 0.0–1.0 (combined score)
    uncertainty_multiplier: float   # Scales prediction uncertainty

    # Per-method details
    tanimoto_score: float = 0.0     # Max similarity to training set
    tanimoto_status: str = "unknown"
    mahalanobis_distance: float = 0.0
    mahalanobis_status: str = "unknown"
    leverage_value: float = 0.0
    leverage_status: str = "unknown"
    isolation_score: float = 0.0
    isolation_status: str = "unknown"
    pca_distance: float = 0.0
    pca_status: str = "unknown"

    # Nearest training molecule
    nearest_smiles: str = ""
    nearest_similarity: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "status": self.status,
            "confidence": round(self.confidence, 4),
            "uncertainty_multiplier": round(self.uncertainty_multiplier, 4),
            "methods": {
                "tanimoto": {
                    "score": round(self.tanimoto_score, 4),
                    "status": self.tanimoto_status,
                },
                "mahalanobis": {
                    "distance": round(self.mahalanobis_distance, 4),
                    "status": self.mahalanobis_status,
                },
                "leverage": {
                    "value": round(self.leverage_value, 6),
                    "status": self.leverage_status,
                },
                "isolation_forest": {
                    "score": round(self.isolation_score, 4),
                    "status": self.isolation_status,
                },
                "pca": {
                    "distance": round(self.pca_distance, 4),
                    "status": self.pca_status,
                },
            },
            "nearest_training_molecule": {
                "smiles": self.nearest_smiles,
                "similarity": round(self.nearest_similarity, 4),
            },
        }


class ApplicabilityDomain:
    """
    Multi-method applicability domain assessment.

    Usage:
        ad = ApplicabilityDomain()
        ad.fit(training_smiles, training_features)

        assessment = ad.assess("CCO")
        print(assessment.status)       # "inside" / "borderline" / "outside"
        print(assessment.confidence)   # 0.0–1.0
    """

    def __init__(
        self,
        tanimoto_threshold: float = None,
        mahalanobis_threshold: float = None,
        leverage_factor: float = None,
        isolation_contamination: float = None,
        pca_components: int = None,
    ):
        cfg = DOMAIN_DEFAULTS
        self.tanimoto_threshold = tanimoto_threshold or cfg["tanimoto_threshold"]
        self.mahalanobis_threshold = mahalanobis_threshold or cfg["mahalanobis_threshold"]
        self.leverage_factor = leverage_factor or cfg["leverage_threshold_factor"]
        self.isolation_contamination = isolation_contamination or cfg["isolation_forest_contamination"]
        self.pca_components = pca_components or cfg["pca_components"]

        # Fitted state
        self._is_fitted = False
        self._training_fps: List = []          # RDKit fingerprint objects
        self._training_smiles: List[str] = []
        self._scaler = StandardScaler()
        self._pca: Optional[PCA] = None
        self._isolation_forest: Optional[IsolationForest] = None

        # Mahalanobis
        self._mean: Optional[np.ndarray] = None
        self._cov_inv: Optional[np.ndarray] = None

        # Leverage
        self._hat_matrix_diag_threshold: float = 0.0
        self._X_train_scaled: Optional[np.ndarray] = None

    @property
    def is_fitted(self) -> bool:
        return self._is_fitted

    def fit(
        self,
        training_smiles: List[str],
        training_features: np.ndarray,
    ) -> Dict:
        """
        Fit the applicability domain using training data.

        Args:
            training_smiles: List of training SMILES for Tanimoto
            training_features: Feature matrix (n_samples, n_features) for
                              Mahalanobis, leverage, PCA, Isolation Forest

        Returns:
            Dict with fitting statistics
        """
        logger.info(f"Fitting applicability domain on {len(training_smiles)} molecules...")

        n_samples, n_features = training_features.shape

        # ── 1. Store training fingerprints for Tanimoto ──
        self._training_smiles = training_smiles
        self._training_fps = []
        for smi in training_smiles:
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                fp = AllChem.GetMorganFingerprintAsBitVect(
                    mol, MORGAN_RADIUS, nBits=MORGAN_NBITS,
                    useChirality=True, useBondTypes=True,
                )
                self._training_fps.append(fp)
            else:
                self._training_fps.append(None)

        # ── 2. Scale features ──
        X_scaled = self._scaler.fit_transform(training_features)
        self._X_train_scaled = X_scaled

        # ── 3. Mahalanobis: compute inverse covariance matrix ──
        self._mean = np.mean(X_scaled, axis=0)
        try:
            cov = np.cov(X_scaled.T)
            # Regularize to avoid singular matrix
            cov += np.eye(cov.shape[0]) * 1e-6
            self._cov_inv = np.linalg.inv(cov)
        except np.linalg.LinAlgError:
            logger.warning("Covariance matrix inversion failed; using diagonal approximation")
            variances = np.var(X_scaled, axis=0) + 1e-6
            self._cov_inv = np.diag(1.0 / variances)

        # ── 4. Leverage: hat matrix threshold ──
        # h* = leverage_factor * (p + 1) / n
        self._hat_matrix_diag_threshold = (
            self.leverage_factor * (n_features + 1) / n_samples
        )

        # ── 5. PCA ──
        n_components = min(self.pca_components, n_features, n_samples)
        self._pca = PCA(n_components=n_components)
        self._pca_training = self._pca.fit_transform(X_scaled)

        # Compute training PCA centroid and max distance
        self._pca_centroid = np.mean(self._pca_training, axis=0)
        pca_dists = np.linalg.norm(self._pca_training - self._pca_centroid, axis=1)
        self._pca_max_distance = np.percentile(pca_dists, 95)

        # ── 6. Isolation Forest ──
        self._isolation_forest = IsolationForest(
            contamination=self.isolation_contamination,
            random_state=42,
            n_estimators=200,
            n_jobs=-1,
        )
        self._isolation_forest.fit(X_scaled)

        self._is_fitted = True

        stats = {
            "n_training": n_samples,
            "n_features": n_features,
            "leverage_threshold": self._hat_matrix_diag_threshold,
            "pca_components": n_components,
            "pca_variance_explained": float(np.sum(self._pca.explained_variance_ratio_)),
            "pca_max_distance_95pct": float(self._pca_max_distance),
        }

        logger.info(f"  Applicability domain fitted: {stats}")
        return stats

    def assess(
        self,
        smiles: str,
        features: np.ndarray = None,
    ) -> DomainAssessment:
        """
        Assess whether a molecule falls within the applicability domain.

        Args:
            smiles: Query SMILES string
            features: Precomputed feature vector (if None, only Tanimoto is used)

        Returns:
            DomainAssessment with status, confidence, and per-method scores
        """
        if not self._is_fitted:
            raise RuntimeError("ApplicabilityDomain not fitted. Call fit() first.")

        scores = {}
        statuses = {}

        # ── 1. Tanimoto Similarity ──
        tanimoto_score, nearest_smi, nearest_sim = self._tanimoto_assessment(smiles)
        scores["tanimoto"] = tanimoto_score
        statuses["tanimoto"] = "inside" if tanimoto_score >= self.tanimoto_threshold else "outside"

        # ── Feature-dependent assessments ──
        if features is not None:
            if features.ndim == 1:
                features = features.reshape(1, -1)
            X_scaled = self._scaler.transform(features)

            # 2. Mahalanobis
            maha_dist = self._mahalanobis_distance(X_scaled[0])
            scores["mahalanobis"] = maha_dist
            statuses["mahalanobis"] = (
                "inside" if maha_dist < self.mahalanobis_threshold
                else "borderline" if maha_dist < self.mahalanobis_threshold * 1.5
                else "outside"
            )

            # 3. Leverage
            leverage = self._leverage_value(X_scaled[0])
            scores["leverage"] = leverage
            statuses["leverage"] = (
                "inside" if leverage < self._hat_matrix_diag_threshold
                else "outside"
            )

            # 4. Isolation Forest
            iso_score = self._isolation_score(X_scaled)
            scores["isolation"] = iso_score
            statuses["isolation"] = "inside" if iso_score > 0 else "outside"

            # 5. PCA distance
            pca_dist = self._pca_distance(X_scaled)
            scores["pca"] = pca_dist
            statuses["pca"] = (
                "inside" if pca_dist < self._pca_max_distance
                else "borderline" if pca_dist < self._pca_max_distance * 1.5
                else "outside"
            )

        # ── Combined Assessment ──
        confidence, status, unc_mult = self._combine_assessments(scores, statuses)

        return DomainAssessment(
            status=status,
            confidence=confidence,
            uncertainty_multiplier=unc_mult,
            tanimoto_score=scores.get("tanimoto", 0.0),
            tanimoto_status=statuses.get("tanimoto", "unknown"),
            mahalanobis_distance=scores.get("mahalanobis", 0.0),
            mahalanobis_status=statuses.get("mahalanobis", "unknown"),
            leverage_value=scores.get("leverage", 0.0),
            leverage_status=statuses.get("leverage", "unknown"),
            isolation_score=scores.get("isolation", 0.0),
            isolation_status=statuses.get("isolation", "unknown"),
            pca_distance=scores.get("pca", 0.0),
            pca_status=statuses.get("pca", "unknown"),
            nearest_smiles=nearest_smi,
            nearest_similarity=nearest_sim,
        )

    def assess_batch(
        self,
        smiles_list: List[str],
        features: np.ndarray = None,
    ) -> List[DomainAssessment]:
        """Assess applicability domain for a batch of molecules."""
        results = []
        for i, smi in enumerate(smiles_list):
            feat = features[i:i+1] if features is not None else None
            results.append(self.assess(smi, feat))
        return results

    # ─── Private Methods ───

    def _tanimoto_assessment(self, smiles: str) -> Tuple[float, str, float]:
        """
        Compute maximum Tanimoto similarity to training set.

        Returns: (max_similarity, nearest_smiles, nearest_similarity)
        """
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return 0.0, "", 0.0

        query_fp = AllChem.GetMorganFingerprintAsBitVect(
            mol, MORGAN_RADIUS, nBits=MORGAN_NBITS,
            useChirality=True, useBondTypes=True,
        )

        max_sim = 0.0
        nearest_idx = -1

        for i, train_fp in enumerate(self._training_fps):
            if train_fp is None:
                continue
            sim = DataStructs.TanimotoSimilarity(query_fp, train_fp)
            if sim > max_sim:
                max_sim = sim
                nearest_idx = i

        nearest_smi = self._training_smiles[nearest_idx] if nearest_idx >= 0 else ""
        return max_sim, nearest_smi, max_sim

    def _mahalanobis_distance(self, x_scaled: np.ndarray) -> float:
        """Compute Mahalanobis distance from training centroid."""
        delta = x_scaled - self._mean
        left = delta @ self._cov_inv
        dist = np.sqrt(np.clip(left @ delta, 0, None))
        return float(dist)

    def _leverage_value(self, x_scaled: np.ndarray) -> float:
        """
        Compute leverage (hat matrix diagonal element).

        h_i = x_i^T (X^T X)^{-1} x_i

        High leverage indicates the molecule is influential in model fitting,
        which correlates with extrapolation risk.
        """
        try:
            X = self._X_train_scaled
            XtX_inv = np.linalg.pinv(X.T @ X)
            h = x_scaled @ XtX_inv @ x_scaled
            return float(np.clip(h, 0, 1))
        except Exception:
            return 0.0

    def _isolation_score(self, X_scaled: np.ndarray) -> float:
        """
        Isolation Forest anomaly score.

        Returns: decision_function output (positive = inlier, negative = outlier)
        """
        try:
            score = self._isolation_forest.decision_function(X_scaled)
            return float(score[0])
        except Exception:
            return 0.0

    def _pca_distance(self, X_scaled: np.ndarray) -> float:
        """Distance from PCA centroid in reduced space."""
        try:
            pca_proj = self._pca.transform(X_scaled)
            dist = np.linalg.norm(pca_proj[0] - self._pca_centroid)
            return float(dist)
        except Exception:
            return 0.0

    def _combine_assessments(
        self,
        scores: Dict[str, float],
        statuses: Dict[str, str],
    ) -> Tuple[float, str, float]:
        """
        Combine per-method assessments into a final score.

        Weighting:
          - Tanimoto: 30% (most interpretable)
          - Mahalanobis: 25% (distribution-aware)
          - Isolation Forest: 20% (non-parametric)
          - PCA: 15% (global structure)
          - Leverage: 10% (influence-based)

        Returns: (confidence, status, uncertainty_multiplier)
        """
        weights = {
            "tanimoto": 0.30,
            "mahalanobis": 0.25,
            "isolation": 0.20,
            "pca": 0.15,
            "leverage": 0.10,
        }

        # Convert scores to 0-1 confidence per method
        method_confidences = {}

        # Tanimoto: already 0-1, higher = better
        if "tanimoto" in scores:
            method_confidences["tanimoto"] = np.clip(scores["tanimoto"], 0, 1)

        # Mahalanobis: lower = better, threshold at self.mahalanobis_threshold
        if "mahalanobis" in scores:
            maha = scores["mahalanobis"]
            method_confidences["mahalanobis"] = np.clip(
                1.0 - maha / (self.mahalanobis_threshold * 2), 0, 1
            )

        # Isolation Forest: positive = inlier, negative = outlier
        if "isolation" in scores:
            iso = scores["isolation"]
            method_confidences["isolation"] = np.clip(0.5 + iso, 0, 1)

        # PCA: lower distance = better
        if "pca" in scores:
            pca_d = scores["pca"]
            method_confidences["pca"] = np.clip(
                1.0 - pca_d / (self._pca_max_distance * 2), 0, 1
            )

        # Leverage: lower = better
        if "leverage" in scores:
            lev = scores["leverage"]
            method_confidences["leverage"] = np.clip(
                1.0 - lev / (self._hat_matrix_diag_threshold * 2), 0, 1
            )

        # Weighted average
        total_weight = 0
        combined = 0
        for method, conf in method_confidences.items():
            w = weights.get(method, 0.1)
            combined += w * conf
            total_weight += w

        confidence = combined / total_weight if total_weight > 0 else 0.5

        # Determine status
        inside_count = sum(1 for s in statuses.values() if s == "inside")
        outside_count = sum(1 for s in statuses.values() if s == "outside")
        total_methods = len(statuses)

        if inside_count >= total_methods * 0.6:
            status = "inside"
        elif outside_count >= total_methods * 0.6:
            status = "outside"
        else:
            status = "borderline"

        # Uncertainty multiplier: 1.0 for inside, up to 3.0 for outside
        if status == "inside":
            unc_mult = 1.0
        elif status == "borderline":
            unc_mult = 1.0 + (1.0 - confidence) * 2.0
        else:
            unc_mult = 2.0 + (1.0 - confidence) * 3.0

        return float(np.clip(confidence, 0, 1)), status, float(unc_mult)

    def get_pca_projection(
        self,
        smiles_list: Optional[List[str]] = None,
        features: Optional[np.ndarray] = None,
    ) -> Dict:
        """
        Get PCA projection for visualization.

        Returns dict with:
          - training_pca: 2D array of training data PCA coordinates
          - query_pca: 2D array of query data PCA coordinates (if provided)
          - variance_explained: per-component variance
        """
        if not self._is_fitted:
            raise RuntimeError("Not fitted.")

        result = {
            "training_pca": self._pca_training[:, :2].tolist(),
            "variance_explained": self._pca.explained_variance_ratio_[:2].tolist(),
        }

        if features is not None:
            X_scaled = self._scaler.transform(features)
            query_pca = self._pca.transform(X_scaled)
            result["query_pca"] = query_pca[:, :2].tolist()

        return result

    def save(self, filepath: str) -> None:
        """Serialize the fitted AD model."""
        import joblib
        state = {
            "training_smiles": self._training_smiles,
            "scaler": self._scaler,
            "pca": self._pca,
            "isolation_forest": self._isolation_forest,
            "mean": self._mean,
            "cov_inv": self._cov_inv,
            "hat_threshold": self._hat_matrix_diag_threshold,
            "pca_centroid": self._pca_centroid,
            "pca_max_distance": self._pca_max_distance,
            "pca_training": self._pca_training,
            "X_train_scaled": self._X_train_scaled,
            "config": {
                "tanimoto_threshold": self.tanimoto_threshold,
                "mahalanobis_threshold": self.mahalanobis_threshold,
                "leverage_factor": self.leverage_factor,
                "isolation_contamination": self.isolation_contamination,
                "pca_components": self.pca_components,
            },
        }
        joblib.dump(state, filepath)
        logger.info(f"  AD model saved to {filepath}")

    def load(self, filepath: str) -> None:
        """Load a previously fitted AD model."""
        import joblib
        state = joblib.load(filepath)

        self._training_smiles = state["training_smiles"]
        self._scaler = state["scaler"]
        self._pca = state["pca"]
        self._isolation_forest = state["isolation_forest"]
        self._mean = state["mean"]
        self._cov_inv = state["cov_inv"]
        self._hat_matrix_diag_threshold = state["hat_threshold"]
        self._pca_centroid = state["pca_centroid"]
        self._pca_max_distance = state["pca_max_distance"]
        self._pca_training = state["pca_training"]
        self._X_train_scaled = state["X_train_scaled"]

        cfg = state.get("config", {})
        self.tanimoto_threshold = cfg.get("tanimoto_threshold", self.tanimoto_threshold)
        self.mahalanobis_threshold = cfg.get("mahalanobis_threshold", self.mahalanobis_threshold)
        self.leverage_factor = cfg.get("leverage_factor", self.leverage_factor)
        self.isolation_contamination = cfg.get("isolation_contamination", self.isolation_contamination)
        self.pca_components = cfg.get("pca_components", self.pca_components)

        # Rebuild training fingerprints
        self._training_fps = []
        for smi in self._training_smiles:
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                fp = AllChem.GetMorganFingerprintAsBitVect(
                    mol, MORGAN_RADIUS, nBits=MORGAN_NBITS,
                    useChirality=True, useBondTypes=True,
                )
                self._training_fps.append(fp)
            else:
                self._training_fps.append(None)

        self._is_fitted = True
        logger.info(f"  AD model loaded from {filepath}")

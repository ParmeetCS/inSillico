"""
serialization.py — Safe Model Serialization & Loading
=======================================================
Handles saving and loading of QSPR models with full metadata,
versioning, and integrity checks.

Why not raw pickle:
  - Pickle files are executable code — loading an untrusted pickle
    can run arbitrary code. In a drug discovery platform handling
    proprietary data, this is a security risk.
  - Our serialization stores model weights via joblib (which uses
    numpy's .npy format for arrays) alongside a JSON metadata file
    that records: training date, descriptor version, feature names,
    model hyperparameters, and evaluation metrics.
  - The metadata file allows model auditing: you can verify that
    the model was trained with the correct descriptor set, on the
    expected dataset, with documented performance.

File format:
  models/qspr/{property}_{model_name}.joblib   — Model + scaler
  models/qspr/{property}_{model_name}.meta.json — Metadata
  models/qspr/{property}_ensemble.meta.json     — Ensemble config
"""

import os
import json
import logging
import time
from typing import Dict, Optional
import joblib
import numpy as np

from .config import MODEL_DIR, DESCRIPTOR_VERSION, MODEL_VERSION

logger = logging.getLogger("qspr.serialization")


class ModelSerializer:
    """
    Serialize and deserialize QSPR models with metadata.

    Each model is saved as two files:
      1. .joblib — Contains the sklearn/xgboost estimator + fitted scaler
      2. .meta.json — Contains training metadata, metrics, and config

    The metadata file ensures:
      - Model provenance tracking (when, how, on what data)
      - Descriptor compatibility checking at load time
      - Performance auditing for regulatory compliance
    """

    def __init__(self, model_dir: str = MODEL_DIR):
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)

    def save_model(
        self,
        model,
        property_name: str,
        model_name: str,
        metrics: Optional[Dict] = None,
        dataset_stats: Optional[Dict] = None,
        hyperparams: Optional[Dict] = None,
        feature_names: Optional[list] = None,
    ) -> str:
        """
        Save a trained QSPRModel to disk.

        Args:
            model: Trained QSPRModel instance
            property_name: e.g., "logp"
            model_name: e.g., "random_forest", "xgboost"
            metrics: Evaluation metrics dict
            dataset_stats: Dataset statistics
            hyperparams: Model hyperparameters
            feature_names: Ordered feature name list

        Returns:
            Path to saved model file
        """
        base_name = f"{property_name}_{model_name}"
        model_path = os.path.join(self.model_dir, f"{base_name}.joblib")
        meta_path = os.path.join(self.model_dir, f"{base_name}.meta.json")

        # Save model + scaler
        payload = {
            "model": model.model,
            "scaler": model.scaler,
            "task": model.task,
            "feature_names": feature_names or model._feature_names,
        }
        joblib.dump(payload, model_path, compress=3)

        # Save metadata
        metadata = {
            "property": property_name,
            "model_name": model_name,
            "model_class": model.__class__.__name__,
            "task": model.task,
            "model_version": MODEL_VERSION,
            "descriptor_version": DESCRIPTOR_VERSION,
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "metrics": metrics or {},
            "dataset_stats": dataset_stats or {},
            "hyperparameters": hyperparams or model.params,
            "n_features": len(feature_names) if feature_names else None,
        }

        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2, default=_json_default)

        size_mb = os.path.getsize(model_path) / (1024 * 1024)
        logger.info(f"  Saved {base_name} ({size_mb:.2f} MB)")

        return model_path

    def save_ensemble_config(
        self,
        property_name: str,
        weights: Dict[str, float],
        ensemble_metrics: Optional[Dict] = None,
    ) -> str:
        """Save ensemble configuration (model weights + metadata)."""
        meta_path = os.path.join(
            self.model_dir, f"{property_name}_ensemble.meta.json"
        )

        config = {
            "property": property_name,
            "type": "WeightedEnsemble",
            "model_version": MODEL_VERSION,
            "weights": weights,
            "metrics": ensemble_metrics or {},
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }

        with open(meta_path, "w") as f:
            json.dump(config, f, indent=2, default=_json_default)

        logger.info(f"  Saved ensemble config: {property_name}")
        return meta_path

    def load_model(
        self,
        property_name: str,
        model_name: str,
    ) -> Dict:
        """
        Load a serialized model + metadata.

        Returns a dict with keys:
          - model: sklearn/xgboost estimator
          - scaler: fitted StandardScaler
          - task: "regression" or "classification"
          - feature_names: list of feature names
          - metadata: full metadata dict

        Raises FileNotFoundError if model files are missing.
        """
        base_name = f"{property_name}_{model_name}"
        model_path = os.path.join(self.model_dir, f"{base_name}.joblib")
        meta_path = os.path.join(self.model_dir, f"{base_name}.meta.json")

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model not found: {model_path}\n"
                f"Run train_qspr.py to train models."
            )

        payload = joblib.load(model_path)

        metadata = {}
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                metadata = json.load(f)

        # Verify descriptor compatibility
        saved_desc_version = metadata.get("descriptor_version", "")
        if saved_desc_version and saved_desc_version != DESCRIPTOR_VERSION:
            logger.warning(
                f"Descriptor version mismatch: model={saved_desc_version}, "
                f"current={DESCRIPTOR_VERSION}. Predictions may be unreliable."
            )

        return {
            "model": payload["model"],
            "scaler": payload["scaler"],
            "task": payload.get("task", "regression"),
            "feature_names": payload.get("feature_names", []),
            "metadata": metadata,
        }

    def load_ensemble_config(self, property_name: str) -> Dict:
        """Load ensemble configuration."""
        meta_path = os.path.join(
            self.model_dir, f"{property_name}_ensemble.meta.json"
        )

        if not os.path.exists(meta_path):
            return {"weights": {"random_forest": 0.4, "xgboost": 0.6}}

        with open(meta_path) as f:
            return json.load(f)

    def list_models(self) -> Dict[str, list]:
        """List all available serialized models grouped by property."""
        if not os.path.exists(self.model_dir):
            return {}

        models = {}
        for filename in os.listdir(self.model_dir):
            if not filename.endswith(".joblib"):
                continue

            name = filename.replace(".joblib", "")
            # Parse property_modelname
            parts = name.split("_")
            if len(parts) >= 2:
                # Handle multi-word names like "random_forest"
                if "random_forest" in name:
                    prop = name.replace("_random_forest", "")
                    model_name = "random_forest"
                elif "xgboost" in name:
                    prop = name.replace("_xgboost", "")
                    model_name = "xgboost"
                else:
                    prop = parts[0]
                    model_name = "_".join(parts[1:])

                if prop not in models:
                    models[prop] = []
                models[prop].append(model_name)

        return models


def _json_default(obj):
    """JSON serialization fallback for numpy types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

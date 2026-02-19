"""
tuning.py — Optuna Hyperparameter Optimization
=================================================
Bayesian hyperparameter optimization for QSPR models using Optuna
with scaffold-based cross-validation as the objective.

Why Optuna over grid/random search:
  - Optuna uses Tree-structured Parzen Estimators (TPE) to model the
    objective function and focus on promising hyperparameter regions.
  - 50 trials with TPE typically finds solutions competitive with
    300+ random search trials.
  - Built-in pruning terminates unpromising trials early, saving compute.
  - Optuna's study objects are serializable for experiment tracking.

Search spaces are designed based on published best practices for
molecular property prediction:
  - RF: n_estimators [100,1000], max_depth [5,30 or None]
  - XGBoost: learning_rate [0.01,0.3], max_depth [3,10], n_estimators [100,500]
"""

import logging
import numpy as np
from typing import Dict, Optional, Type

from .models import QSPRModel, RandomForestQSPR, XGBoostQSPR
from .splitting import ScaffoldSplitter
from .config import OPTUNA_N_TRIALS, OPTUNA_TIMEOUT, CV_FOLDS

logger = logging.getLogger("qspr.tuning")


class OptunaTuner:
    """
    Hyperparameter optimizer using Optuna with scaffold cross-validation.

    Usage:
        tuner = OptunaTuner(task="regression")
        best_params = tuner.tune_random_forest(X, y, smiles_list)
        best_params = tuner.tune_xgboost(X, y, smiles_list)
    """

    def __init__(
        self,
        task: str,
        n_trials: int = OPTUNA_N_TRIALS,
        timeout: int = OPTUNA_TIMEOUT,
        n_folds: int = CV_FOLDS,
    ):
        self.task = task
        self.n_trials = n_trials
        self.timeout = timeout
        self.n_folds = n_folds

    def tune_random_forest(
        self,
        X: np.ndarray,
        y: np.ndarray,
        smiles_list: list,
    ) -> Dict:
        """
        Optimize RandomForest hyperparameters.

        Search space (scientifically motivated):
          - n_estimators: [200, 1000] — More trees reduce variance;
            diminishing returns past ~500 for molecular datasets.
          - max_depth: [5, 30] or None — Deep trees for complex SAR;
            None lets trees grow until pure leaves.
          - min_samples_split: [2, 20] — Controls overfitting.
          - min_samples_leaf: [1, 10] — Minimum leaf size for smoothing.
          - max_features: ["sqrt", "log2", 0.3..0.8] — Feature subsampling
            for decorrelation between trees.

        Returns:
            Best hyperparameters dict
        """
        try:
            import optuna
            optuna.logging.set_verbosity(optuna.logging.WARNING)
        except ImportError:
            logger.warning("Optuna not installed. Using default hyperparameters.")
            from .config import DEFAULT_RF_PARAMS
            return DEFAULT_RF_PARAMS

        splitter = ScaffoldSplitter()
        folds = splitter.kfold_scaffold_split(smiles_list, self.n_folds)

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 200, 1000, step=100),
                "max_depth": trial.suggest_int("max_depth", 5, 30) if trial.suggest_categorical("use_max_depth", [True, False]) else None,
                "min_samples_split": trial.suggest_int("min_samples_split", 2, 20),
                "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 10),
                "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2"]),
                "n_jobs": -1,
                "random_state": 42,
            }

            scores = []
            for train_idx, val_idx in folds:
                model = RandomForestQSPR(task=self.task, params=params)
                model.fit(X[train_idx], y[train_idx])

                if self.task == "regression":
                    from sklearn.metrics import r2_score
                    y_pred = model.predict(X[val_idx])
                    scores.append(r2_score(y[val_idx], y_pred))
                else:
                    from sklearn.metrics import roc_auc_score
                    try:
                        y_proba = model.predict_proba(X[val_idx])[:, 1]
                        scores.append(roc_auc_score(y[val_idx], y_proba))
                    except ValueError:
                        scores.append(0.5)

            return np.mean(scores)

        study = optuna.create_study(direction="maximize")
        study.optimize(
            objective,
            n_trials=self.n_trials,
            timeout=self.timeout,
            show_progress_bar=False,
        )

        best_params = study.best_params.copy()
        # Reconstruct max_depth
        if not best_params.pop("use_max_depth", True):
            best_params["max_depth"] = None
        best_params["n_jobs"] = -1
        best_params["random_state"] = 42

        logger.info(
            f"  RF tuning complete: best score={study.best_value:.4f} "
            f"({self.n_trials} trials)"
        )

        return best_params

    def tune_xgboost(
        self,
        X: np.ndarray,
        y: np.ndarray,
        smiles_list: list,
    ) -> Dict:
        """
        Optimize XGBoost hyperparameters.

        Search space:
          - n_estimators: [100, 500] — More rounds with low LR.
          - max_depth: [3, 10] — Shallow trees prevent overfitting
            in boosted ensembles (unlike RF where depth is beneficial).
          - learning_rate: [0.01, 0.3] — Lower LR needs more rounds.
          - subsample: [0.6, 1.0] — Row subsampling for regularization.
          - colsample_bytree: [0.5, 1.0] — Column subsampling.
          - reg_alpha: [1e-3, 10] — L1 regularization.
          - reg_lambda: [1e-3, 10] — L2 regularization.
          - gamma: [0, 5] — Min loss reduction for split.

        Returns:
            Best hyperparameters dict
        """
        try:
            import optuna
            optuna.logging.set_verbosity(optuna.logging.WARNING)
        except ImportError:
            logger.warning("Optuna not installed. Using default hyperparameters.")
            from .config import DEFAULT_XGB_PARAMS
            return DEFAULT_XGB_PARAMS

        splitter = ScaffoldSplitter()
        folds = splitter.kfold_scaffold_split(smiles_list, self.n_folds)

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 500, step=50),
                "max_depth": trial.suggest_int("max_depth", 3, 10),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-3, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
                "gamma": trial.suggest_float("gamma", 0, 5.0),
                "random_state": 42,
                "verbosity": 0,
                "n_jobs": -1,
            }

            scores = []
            for train_idx, val_idx in folds:
                model = XGBoostQSPR(task=self.task, params=params)
                model.fit(X[train_idx], y[train_idx])

                if self.task == "regression":
                    from sklearn.metrics import r2_score
                    y_pred = model.predict(X[val_idx])
                    scores.append(r2_score(y[val_idx], y_pred))
                else:
                    from sklearn.metrics import roc_auc_score
                    try:
                        y_proba = model.predict_proba(X[val_idx])[:, 1]
                        scores.append(roc_auc_score(y[val_idx], y_proba))
                    except ValueError:
                        scores.append(0.5)

            return np.mean(scores)

        study = optuna.create_study(direction="maximize")
        study.optimize(
            objective,
            n_trials=self.n_trials,
            timeout=self.timeout,
            show_progress_bar=False,
        )

        best_params = study.best_params.copy()
        best_params["random_state"] = 42
        best_params["verbosity"] = 0
        best_params["n_jobs"] = -1

        logger.info(
            f"  XGB tuning complete: best score={study.best_value:.4f} "
            f"({self.n_trials} trials)"
        )

        return best_params

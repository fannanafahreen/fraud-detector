"""
train.py — Train an XGBoost classifier on the Kaggle Credit Card Fraud dataset.

This is SUPERVISED learning — the Class column (0=legit, 1=fraud) is used as labels.
XGBoost handles class imbalance via scale_pos_weight = n_legit / n_fraud.

Usage:
    python train.py           # requires creditcard.csv
    python train.py --demo    # uses synthetic data, no download needed
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib
import xgboost as xgb

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report,
    precision_score,
    recall_score,
    f1_score,
    average_precision_score,
    confusion_matrix,
    precision_recall_curve,
)

# ── Config ────────────────────────────────────────────────────────────────────
DATA_PATH    = os.getenv("DATA_PATH",  "creditcard.csv")
MODEL_PATH   = os.getenv("MODEL_PATH", "model.pkl")
RANDOM_STATE = 42


# ── Demo data generator ───────────────────────────────────────────────────────
def generate_demo_data(n_legit: int = 10_000, n_fraud: int = 200) -> pd.DataFrame:
    """Generate synthetic transactions when creditcard.csv is unavailable."""
    rng = np.random.default_rng(RANDOM_STATE)
    n   = n_legit + n_fraud

    time   = rng.uniform(0, 172_800, n)
    amount = np.concatenate([
        rng.lognormal(3.5, 1.2, n_legit),   # legit: small, varied amounts
        rng.lognormal(5.0, 0.8, n_fraud),    # fraud: larger amounts
    ])

    # V1-V28: fraud transactions have shifted means (detectable pattern)
    v_legit = rng.standard_normal((n_legit, 28))
    v_fraud = rng.standard_normal((n_fraud, 28)) + rng.uniform(-3, 3, 28)
    v_data  = np.vstack([v_legit, v_fraud])

    labels = np.array([0] * n_legit + [1] * n_fraud)

    df = pd.DataFrame(v_data, columns=[f"V{i}" for i in range(1, 29)])
    df.insert(0, "Time",   time)
    df.insert(1, "Amount", amount)
    df["Class"] = labels

    df = df.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)
    print(f"[DEMO] Generated {n_legit:,} legit + {n_fraud:,} fraud transactions.")
    return df


# ── Data loading ──────────────────────────────────────────────────────────────
def load_data(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        print(f"[ERROR] '{path}' not found.")
        print("  Download from https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud")
        print("  Or run:  python train.py --demo")
        sys.exit(1)

    df = pd.read_csv(path)
    print(f"[INFO] Loaded {len(df):,} rows, {df.shape[1]} columns.")
    return df


# ── Preprocessing ─────────────────────────────────────────────────────────────
def preprocess(df: pd.DataFrame):
    """Scale Amount and Time; V1-V28 are already PCA-transformed by Kaggle."""
    amount_scaler = StandardScaler()
    time_scaler   = StandardScaler()

    df = df.copy()
    df["Amount_scaled"] = amount_scaler.fit_transform(df[["Amount"]])
    df["Time_scaled"]   = time_scaler.fit_transform(df[["Time"]])

    v_cols       = [f"V{i}" for i in range(1, 29)]
    feature_cols = ["Time_scaled", "Amount_scaled"] + v_cols
    X = df[feature_cols].values
    y = df["Class"].values

    return X, y, amount_scaler, time_scaler, feature_cols


# ── Optimal threshold ─────────────────────────────────────────────────────────
def find_optimal_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Return the probability threshold that maximises F1 on the validation set."""
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    f1_scores = 2 * precisions * recalls / (precisions + recalls + 1e-9)
    best_idx  = int(np.argmax(f1_scores[:-1]))
    return float(thresholds[best_idx])


# ── Training ──────────────────────────────────────────────────────────────────
def train_model(X_train: np.ndarray, y_train: np.ndarray) -> xgb.XGBClassifier:
    """
    Train XGBoost with scale_pos_weight to compensate for the severe class
    imbalance (~0.17 % fraud in the real dataset).
    """
    n_legit = int((y_train == 0).sum())
    n_fraud = int((y_train == 1).sum())
    ratio   = n_legit / n_fraud
    print(f"[INFO] Class ratio legit/fraud = {ratio:.1f}  → scale_pos_weight={ratio:.1f}")
    print("[INFO] Training XGBoost …")

    model = xgb.XGBClassifier(
        n_estimators    = 300,
        max_depth       = 6,
        learning_rate   = 0.1,
        scale_pos_weight= ratio,   # upweight the minority fraud class
        eval_metric     = "aucpr", # area under precision-recall curve
        random_state    = RANDOM_STATE,
        n_jobs          = -1,
        verbosity       = 0,
    )
    model.fit(X_train, y_train)
    return model


# ── Evaluation ────────────────────────────────────────────────────────────────
def evaluate(model, X_test: np.ndarray, y_test: np.ndarray, threshold: float) -> dict:
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)

    pr_auc    = average_precision_score(y_test, y_prob)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall    = recall_score(y_test,    y_pred, zero_division=0)
    f1        = f1_score(y_test,        y_pred, zero_division=0)
    cm        = confusion_matrix(y_test, y_pred).tolist()

    print("\n── Evaluation ───────────────────────────────────────────")
    print(classification_report(y_test, y_pred,
                                target_names=["Legit", "Fraud"], zero_division=0))
    print(f"  PR-AUC    : {pr_auc:.4f}   ← main metric for imbalanced data")
    print(f"  Precision : {precision:.4f}")
    print(f"  Recall    : {recall:.4f}")
    print(f"  F1 Score  : {f1:.4f}")
    print(f"  Threshold : {threshold:.4f}")
    print(f"  Confusion matrix:\n  {np.array(cm)}")
    print("─────────────────────────────────────────────────────────\n")

    return {
        "pr_auc":    round(pr_auc, 4),
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "threshold": round(threshold, 4),
        "confusion_matrix": cm,
    }


# ── Save ──────────────────────────────────────────────────────────────────────
def save_artifacts(model, amount_scaler, time_scaler, feature_cols, metrics, path: str):
    # Feature importance dict (feature_name → importance score), sorted descending
    importance = dict(
        sorted(
            zip(feature_cols, model.feature_importances_.tolist()),
            key=lambda x: x[1],
            reverse=True,
        )
    )

    joblib.dump({
        "model":              model,
        "amount_scaler":      amount_scaler,
        "time_scaler":        time_scaler,
        "feature_cols":       feature_cols,
        "metrics":            metrics,
        "feature_importance": importance,
    }, path)
    print(f"[INFO] Artifacts saved to '{path}'.")


# ── Entry point ───────────────────────────────────────────────────────────────
def main(demo_mode: bool = False):
    if demo_mode:
        print("[DEMO] Using synthetic data.")
        df = generate_demo_data()
    else:
        df = load_data(DATA_PATH)

    fraud_n = int(df["Class"].sum())
    legit_n = len(df) - fraud_n
    print(f"[INFO] Legit: {legit_n:,}  |  Fraud: {fraud_n:,}")

    X, y, amount_scaler, time_scaler, feature_cols = preprocess(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"[INFO] Train: {len(X_train):,}  |  Test: {len(X_test):,}")

    model     = train_model(X_train, y_train)
    y_prob    = model.predict_proba(X_test)[:, 1]
    threshold = find_optimal_threshold(y_test, y_prob)
    metrics   = evaluate(model, X_test, y_test, threshold)

    save_artifacts(model, amount_scaler, time_scaler, feature_cols, metrics, MODEL_PATH)


if __name__ == "__main__":
    main(demo_mode="--demo" in sys.argv)

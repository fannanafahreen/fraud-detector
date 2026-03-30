"""
train.py — Train an Isolation Forest model on the Kaggle Credit Card Fraud dataset.

Usage:
    python train.py           # requires creditcard.csv
    python train.py --demo    # generates synthetic data, no download needed

Expects 'creditcard.csv' in the same directory (real mode).
Download from: https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

# ── Configuration ────────────────────────────────────────────────────────────
DATA_PATH  = os.getenv("DATA_PATH", "creditcard.csv")
MODEL_PATH = os.getenv("MODEL_PATH", "model.pkl")

# Isolation Forest hyper-parameters
# contamination ≈ fraction of fraud in the original dataset (~0.17 %)
CONTAMINATION = 0.002   # slightly higher than the true rate helps recall
N_ESTIMATORS  = 200
RANDOM_STATE  = 42


def generate_demo_data(n_legit: int = 10_000, n_fraud: int = 200) -> pd.DataFrame:
    """
    Generate synthetic credit-card-like data for demo/testing purposes.
    Fraud transactions are made distinct by shifting their V-feature means.
    """
    rng = np.random.default_rng(RANDOM_STATE)
    n_total = n_legit + n_fraud

    # Time: uniformly spread over 48 hours (in seconds)
    time = rng.uniform(0, 172_800, n_total)

    # Amount: log-normal (mimics real spending distributions)
    amount_legit = rng.lognormal(mean=3.5, sigma=1.2, size=n_legit)
    amount_fraud = rng.lognormal(mean=5.0, sigma=0.8, size=n_fraud)
    amount = np.concatenate([amount_legit, amount_fraud])

    # V1–V28: standard normal for legit; shifted mean for fraud (makes them detectable)
    v_legit = rng.standard_normal((n_legit, 28))
    v_fraud = rng.standard_normal((n_fraud, 28)) + rng.uniform(-3, 3, 28)
    v_data  = np.vstack([v_legit, v_fraud])

    labels = np.array([0] * n_legit + [1] * n_fraud)

    df = pd.DataFrame(v_data, columns=[f"V{i}" for i in range(1, 29)])
    df.insert(0, "Time",   time)
    df.insert(1, "Amount", amount)
    df["Class"] = labels

    # Shuffle rows
    df = df.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)
    print(f"[DEMO] Generated {n_legit:,} legitimate + {n_fraud:,} fraud transactions.")
    return df


def load_data(path: str) -> pd.DataFrame:
    """Load the creditcard CSV and validate its shape."""
    if not os.path.exists(path):
        print(f"[ERROR] Dataset not found at '{path}'.")
        print("  Download it from https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud")
        print("  and place 'creditcard.csv' next to train.py.")
        print("  Or run:  python train.py --demo  to use synthetic data instead.")
        sys.exit(1)

    df = pd.read_csv(path)
    print(f"[INFO] Loaded {len(df):,} rows, {df.shape[1]} columns.")

    required = {"Time", "Amount", "Class"}
    missing = required - set(df.columns)
    if missing:
        print(f"[ERROR] Missing expected columns: {missing}")
        sys.exit(1)

    return df


def preprocess(df: pd.DataFrame):
    """
    Scale Amount and Time independently (V1-V28 are already PCA-transformed by Kaggle).
    Two separate scalers are used so each can be applied independently at inference time.
    Return feature matrix X, label vector y, and both scalers.
    """
    amount_scaler = StandardScaler()
    time_scaler   = StandardScaler()

    df = df.copy()
    # fit_transform each column with its own scaler so we preserve both sets of stats
    df["Amount_scaled"] = amount_scaler.fit_transform(df[["Amount"]])
    df["Time_scaled"]   = time_scaler.fit_transform(df[["Time"]])

    # Build feature matrix: [Time_scaled, Amount_scaled, V1 … V28]
    v_cols = [f"V{i}" for i in range(1, 29)]
    feature_cols = ["Time_scaled", "Amount_scaled"] + v_cols
    X = df[feature_cols].values
    y = df["Class"].values          # 0 = legitimate, 1 = fraud

    return X, y, amount_scaler, time_scaler, feature_cols


def train_model(X_train: np.ndarray) -> IsolationForest:
    """Fit Isolation Forest on training data (unsupervised — no labels needed)."""
    print(f"[INFO] Training Isolation Forest  "
          f"(n_estimators={N_ESTIMATORS}, contamination={CONTAMINATION}) …")

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,          # use all CPU cores
    )
    model.fit(X_train)
    return model


def evaluate(model: IsolationForest, X_test: np.ndarray, y_test: np.ndarray):
    """
    Convert raw Isolation Forest predictions to binary labels and print metrics.
    IsolationForest.predict() returns +1 (inlier/legit) or -1 (outlier/fraud).
    """
    raw_preds = model.predict(X_test)           # +1 or -1
    y_pred    = (raw_preds == -1).astype(int)   # 1 = fraud, 0 = legit

    # Anomaly scores: lower (more negative) means more anomalous
    scores = model.decision_function(X_test)    # higher = more normal
    # Invert so that higher score = more likely fraud, then normalise to [0,1]
    fraud_scores = 1 - (scores - scores.min()) / (scores.max() - scores.min() + 1e-9)

    prec  = precision_score(y_test, y_pred, zero_division=0)
    rec   = recall_score(y_test, y_pred,    zero_division=0)
    f1    = f1_score(y_test, y_pred,        zero_division=0)
    auc   = roc_auc_score(y_test, fraud_scores)

    print("\n── Evaluation on held-out test set ─────────────────────")
    print(classification_report(y_test, y_pred, target_names=["Legit", "Fraud"],
                                  zero_division=0))
    print(f"  Precision : {prec:.4f}")
    print(f"  Recall    : {rec:.4f}")
    print(f"  F1 Score  : {f1:.4f}")
    print(f"  AUC-ROC   : {auc:.4f}")
    print(f"\n  Confusion matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y_test, y_pred)
    print(f"  {cm}")
    print("─────────────────────────────────────────────────────────\n")


def save_artifacts(model, amount_scaler, time_scaler, feature_cols, path: str):
    """Persist everything the API needs at inference time."""
    artifact = {
        "model":          model,
        "amount_scaler":  amount_scaler,   # scaler fit on Amount column
        "time_scaler":    time_scaler,     # scaler fit on Time column
        "feature_cols":   feature_cols,
    }
    joblib.dump(artifact, path)
    print(f"[INFO] Model artifacts saved to '{path}'.")


def main(demo_mode: bool = False):
    # 1. Load data (real CSV or synthetic demo)
    if demo_mode:
        print("[DEMO] Running in demo mode — using synthetic data.")
        df = generate_demo_data()
    else:
        df = load_data(DATA_PATH)

    fraud_count = df["Class"].sum()
    legit_count = len(df) - fraud_count
    print(f"[INFO] Class distribution — Legit: {legit_count:,}  |  Fraud: {fraud_count:,}")

    # 2. Pre-process
    X, y, amount_scaler, time_scaler, feature_cols = preprocess(df)

    # 3. Train / test split (stratify to preserve fraud ratio in both splits)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"[INFO] Train size: {len(X_train):,}  |  Test size: {len(X_test):,}")

    # 4. Train (Isolation Forest is unsupervised — only X_train is used)
    model = train_model(X_train)

    # 5. Evaluate on labelled test set
    evaluate(model, X_test, y_test)

    # 6. Save model + scaler bundle
    save_artifacts(model, amount_scaler, time_scaler, feature_cols, MODEL_PATH)


if __name__ == "__main__":
    demo_mode = "--demo" in sys.argv
    main(demo_mode=demo_mode)

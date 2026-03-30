"""
main.py — FastAPI backend for the Fraud Detection service.

Run locally:
    uvicorn main:app --reload --port 8000
"""

import os
import numpy as np
import joblib

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List

# ── Path to the saved model bundle ───────────────────────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "model.pkl")

# ── Global state: populated during startup ────────────────────────────────────
ml_model          = None   # IsolationForest instance
ml_amount_scaler  = None   # StandardScaler fit on Amount
ml_time_scaler    = None   # StandardScaler fit on Time
ml_features: list = []


# ── Lifespan: load model once when the server starts ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the ML artifacts on startup; release on shutdown."""
    global ml_model, ml_amount_scaler, ml_time_scaler, ml_features

    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(
            f"Model file '{MODEL_PATH}' not found. "
            "Run `python train.py` first to generate it."
        )

    artifact          = joblib.load(MODEL_PATH)
    ml_model          = artifact["model"]
    ml_amount_scaler  = artifact["amount_scaler"]
    ml_time_scaler    = artifact["time_scaler"]
    ml_features       = artifact["feature_cols"]
    print(f"[INFO] Model loaded from '{MODEL_PATH}'.")
    yield
    # Nothing to clean up, but this is where you would release resources.


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Fraud Detection API",
    description="Detect credit-card fraud using an Isolation Forest model.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the React dev server (port 5173) and any deployed frontend to call us.
# Tighten origins in production to your actual Vercel domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Replace "*" with your Vercel URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ────────────────────────────────────────────────
class PredictRequest(BaseModel):
    """
    Input schema for the /predict endpoint.

    - amount:   Transaction amount (raw USD value)
    - time:     Seconds elapsed since the first transaction in the dataset
    - features: Optional list of 28 PCA components (V1–V28).
                Defaults to all zeros when not provided.
    """
    amount:   float = Field(...,  ge=0,   description="Transaction amount in USD")
    time:     float = Field(...,  ge=0,   description="Seconds elapsed since dataset epoch")
    features: List[float] = Field(
        default_factory=lambda: [0.0] * 28,
        min_length=28,
        max_length=28,
        description="28 PCA-transformed features (V1–V28)"
    )


class PredictResponse(BaseModel):
    """Output schema returned by /predict."""
    result:     str   # "Fraud" | "Legitimate"
    confidence: float # 0.0 – 1.0 (probability of the predicted class)


# ── Helper ────────────────────────────────────────────────────────────────────
def build_feature_vector(amount: float, time: float, v_features: List[float]) -> np.ndarray:
    """
    Replicate the same preprocessing used during training:
      1. Scale Amount with its dedicated scaler.
      2. Scale Time with its dedicated scaler.
      3. Concatenate [Time_scaled, Amount_scaled, V1 … V28].
    Each scaler was fit on a (N, 1) array, so we pass a [[value]] shape.
    """
    amount_scaled = ml_amount_scaler.transform([[amount]])[0][0]
    time_scaled   = ml_time_scaler.transform([[time]])[0][0]

    feature_vector = np.array([time_scaled, amount_scaled] + v_features, dtype=np.float64)
    return feature_vector.reshape(1, -1)   # shape: (1, 30)


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    """Health-check endpoint."""
    return {"status": "ok", "message": "Fraud Detection API is running."}


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
async def predict(request: PredictRequest):
    """
    Predict whether a transaction is fraudulent.

    Returns:
        result     — "Fraud" or "Legitimate"
        confidence — model's confidence (0.0–1.0) in the predicted label
    """
    if ml_model is None or ml_amount_scaler is None or ml_time_scaler is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Try again shortly.")

    # Pad / truncate features to exactly 28 values just in case
    v_features = (list(request.features) + [0.0] * 28)[:28]

    # Build the feature vector the same way as during training
    X = build_feature_vector(request.amount, request.time, v_features)

    # Isolation Forest: predict() → +1 (inlier/legit) or -1 (outlier/fraud)
    raw_pred = ml_model.predict(X)[0]
    is_fraud = raw_pred == -1

    # decision_function() returns the anomaly score:
    #   positive → more normal  |  negative → more anomalous
    anomaly_score = ml_model.decision_function(X)[0]

    # Convert anomaly score to a [0, 1] confidence value.
    # We use a sigmoid-like mapping so the confidence is always in range.
    # Higher |score| → higher confidence in the prediction.
    import math
    # Normalise: fraud confidence rises as score goes more negative
    raw_conf = 1 / (1 + math.exp(anomaly_score * 5))  # sigmoid(-score * 5) ≈ fraud prob

    if is_fraud:
        confidence = float(raw_conf)
        result = "Fraud"
    else:
        confidence = float(1.0 - raw_conf)
        result = "Legitimate"

    # Clamp to [0.50, 0.99] so we never show "50 % sure it's fraud" or an impossible 100 %
    confidence = max(0.50, min(0.99, confidence))

    return PredictResponse(result=result, confidence=round(confidence, 4))

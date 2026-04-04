"""
main.py — FastAPI backend for the Fraud Detection Dashboard.

Endpoints:
  POST /predict                  — analyse a single transaction
  POST /explain                  — LangChain/GPT explanation for a transaction
  GET  /dashboard/stats          — KPI cards data
  GET  /transactions             — paginated + filtered transaction list
  GET  /transactions/recent      — last N transactions
  GET  /alerts                   — high-score transactions for the alerts panel
  GET  /fraud-by-hour            — hourly fraud counts (last 24 h) for the chart
  GET  /model/metrics            — XGBoost evaluation metrics
  GET  /model/feature-importance — top feature importances

Run:
    uvicorn main:app --reload --port 8000
"""

import os
import math
import asyncio
import datetime
import numpy as np
import pandas as pd
import joblib

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session

from database import create_tables, get_db, Transaction, SessionLocal
from dotenv import load_dotenv
load_dotenv()   # load OPENAI_API_KEY from .env before anything else

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "model.pkl")
DATA_PATH  = os.getenv("DATA_PATH",  "creditcard.csv")
SEED_COUNT = 600    # historical rows to insert on first run

# ── Global ML state ───────────────────────────────────────────────────────────
ml_model              = None
ml_amount_scaler      = None
ml_time_scaler        = None
ml_feature_cols: list = []
ml_metrics:      dict = {}
ml_importance:   dict = {}
ml_threshold:  float  = 0.5


# ── Helpers ───────────────────────────────────────────────────────────────────
def score_to_status(score: float) -> str:
    """Map a fraud probability to a human-readable status."""
    if score >= 0.70:
        return "Fraud"
    if score >= 0.40:
        return "Review"
    return "Safe"


def run_prediction(amount: float, time_sec: float, v_features: List[float]) -> float:
    """Scale inputs and return XGBoost fraud probability (0–1)."""
    amount_scaled = float(ml_amount_scaler.transform([[amount]])[0][0])
    time_scaled   = float(ml_time_scaler.transform([[time_sec]])[0][0])
    x = np.array([time_scaled, amount_scaled] + v_features, dtype=np.float64).reshape(1, -1)
    return float(ml_model.predict_proba(x)[0][1])


def txn_to_dict(t: Transaction) -> dict:
    return {
        "id":           t.id,
        "txn_id":       t.txn_id,
        "amount":       t.amount,
        "time_seconds": t.time_seconds,
        "fraud_score":  t.fraud_score,
        "status":       t.status,
        "timestamp":    t.timestamp.isoformat() if t.timestamp else None,
    }


# ── Database seeding ──────────────────────────────────────────────────────────
def seed_database(db: Session):
    """
    Populate the DB with historical transactions on first startup.
    Uses creditcard.csv if available, otherwise generates synthetic data.
    Assigns timestamps spread across the last 48 hours.
    """
    if db.query(Transaction).count() > 0:
        return  # already seeded

    print("[INFO] Seeding database …")
    rng = np.random.default_rng(42)

    # Try real CSV first
    df = None
    if os.path.exists(DATA_PATH):
        try:
            df = pd.read_csv(DATA_PATH).sample(n=SEED_COUNT, random_state=42)
        except Exception:
            df = None

    # Fallback: synthetic data
    if df is None:
        n           = SEED_COUNT
        v_data      = rng.standard_normal((n, 28))
        fraud_mask  = rng.random(n) < 0.02
        v_data[fraud_mask] += rng.uniform(-3, 3, 28)
        df          = pd.DataFrame(v_data, columns=[f"V{i}" for i in range(1, 29)])
        df["Time"]  = rng.uniform(0, 172_800, n)
        df["Amount"]= rng.lognormal(3.5, 1.2, n)
        df["Class"] = fraud_mask.astype(int)

    # Spread timestamps evenly over the last 48 hours
    now  = datetime.datetime.utcnow()
    n    = len(df)
    ts   = [now - datetime.timedelta(hours=48 * (1 - i / n)) for i in range(n)]

    records = []
    for i, (_, row) in enumerate(df.iterrows()):
        v  = [float(row.get(f"V{j}", 0.0)) for j in range(1, 29)]
        am = float(row.get("Amount", 50.0))
        ti = float(row.get("Time",    0.0))
        sc = run_prediction(am, ti, v)
        records.append(Transaction(
            txn_id       = f"TXN-{1000 + i}",
            amount       = round(am, 2),
            time_seconds = round(ti, 2),
            fraud_score  = round(sc, 4),
            status       = score_to_status(sc),
            timestamp    = ts[i],
        ))

    db.bulk_save_objects(records)
    db.commit()
    print(f"[INFO] Seeded {len(records)} transactions.")


# ── Background task: simulate live transactions ───────────────────────────────
async def simulate_live():
    """Add one new simulated transaction every 30 seconds to keep the dashboard lively."""
    rng     = np.random.default_rng()
    counter = [1000 + SEED_COUNT]

    while True:
        await asyncio.sleep(30)
        db = SessionLocal()
        try:
            is_fraud = rng.random() < 0.02
            amount   = float(rng.lognormal(5.0 if is_fraud else 3.5, 0.8 if is_fraud else 1.2))
            time_sec = float(rng.uniform(0, 172_800))
            v_shift  = rng.uniform(-3, 3, 28) if is_fraud else np.zeros(28)
            v        = (rng.standard_normal(28) + v_shift).tolist()

            score  = run_prediction(amount, time_sec, v)
            status = score_to_status(score)
            counter[0] += 1

            db.add(Transaction(
                txn_id       = f"TXN-{counter[0]}",
                amount       = round(amount, 2),
                time_seconds = round(time_sec, 2),
                fraud_score  = round(score, 4),
                status       = status,
                timestamp    = datetime.datetime.utcnow(),
            ))
            db.commit()
        except Exception as e:
            print(f"[WARN] Simulation error: {e}")
        finally:
            db.close()


# ── App lifespan ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model, ml_amount_scaler, ml_time_scaler
    global ml_feature_cols, ml_metrics, ml_importance, ml_threshold

    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(
            f"'{MODEL_PATH}' not found — run `python train.py` first."
        )

    artifact          = joblib.load(MODEL_PATH)
    ml_model          = artifact["model"]
    ml_amount_scaler  = artifact["amount_scaler"]
    ml_time_scaler    = artifact["time_scaler"]
    ml_feature_cols   = artifact["feature_cols"]
    ml_metrics        = artifact.get("metrics", {})
    ml_importance     = artifact.get("feature_importance", {})
    ml_threshold      = ml_metrics.get("threshold", 0.5)
    print(f"[INFO] Model loaded — PR-AUC: {ml_metrics.get('pr_auc', 'N/A')}")

    # Database
    create_tables()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    # Background live-feed
    task = asyncio.create_task(simulate_live())
    yield
    task.cancel()


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Fraud Detection API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # lock to your Vercel URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    amount:   float      = Field(..., ge=0, description="Transaction amount in USD")
    time:     float      = Field(..., ge=0, description="Seconds since dataset epoch")
    features: List[float] = Field(
        default_factory=lambda: [0.0] * 28,
        min_length=28, max_length=28,
    )


class PredictResponse(BaseModel):
    txn_id:     str
    result:     str
    confidence: float
    status:     str


class ExplainRequest(BaseModel):
    txn_id:     str
    amount:     float
    fraud_score:float
    status:     str
    features:   List[float] = Field(default_factory=lambda: [0.0] * 28)


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
async def predict(req: PredictRequest, db: Session = Depends(get_db)):
    """Analyse a single transaction and store the result."""
    if ml_model is None:
        raise HTTPException(503, "Model not ready")

    v = (list(req.features) + [0.0] * 28)[:28]
    score  = run_prediction(req.amount, req.time, v)
    status = score_to_status(score)

    # Confidence: how certain the model is about its prediction
    if status == "Fraud":
        result     = "Fraud"
        confidence = min(0.99, max(0.70, score))
    elif status == "Review":
        result     = "Review"
        confidence = score
    else:
        result     = "Legitimate"
        confidence = min(0.99, max(0.50, 1.0 - score))

    # Persist
    count  = db.query(Transaction).count()
    txn_id = f"TXN-{count + 1000}"
    db.add(Transaction(
        txn_id       = txn_id,
        amount       = round(req.amount, 2),
        time_seconds = round(req.time, 2),
        fraud_score  = round(score, 4),
        status       = status,
        timestamp    = datetime.datetime.utcnow(),
    ))
    db.commit()

    return PredictResponse(
        txn_id     = txn_id,
        result     = result,
        confidence = round(confidence, 4),
        status     = status,
    )


@app.get("/dashboard/stats", tags=["Dashboard"])
async def dashboard_stats(db: Session = Depends(get_db)):
    """KPI card data: totals, fraud rate, PR-AUC, pending review count."""
    total  = db.query(Transaction).count()
    fraud  = db.query(Transaction).filter(Transaction.status == "Fraud").count()
    review = db.query(Transaction).filter(Transaction.status == "Review").count()
    return {
        "total_transactions": total,
        "fraud_detected":     fraud,
        "fraud_percentage":   round(fraud / total * 100, 2) if total else 0,
        "pr_auc":             ml_metrics.get("pr_auc", 0),
        "pending_review":     review,
    }


@app.get("/transactions/recent", tags=["Transactions"])
async def recent_transactions(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    txns = (
        db.query(Transaction)
        .order_by(Transaction.timestamp.desc())
        .limit(limit)
        .all()
    )
    return {"transactions": [txn_to_dict(t) for t in txns]}


@app.get("/transactions", tags=["Transactions"])
async def get_transactions(
    status:   Optional[str] = Query(None, description="Filter: Fraud | Review | Safe | All"),
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(20, ge=1, le=100),
    db:       Session       = Depends(get_db),
):
    """Paginated, filterable transaction list."""
    q = db.query(Transaction)
    if status and status != "All":
        q = q.filter(Transaction.status == status)

    total = q.count()
    txns  = (
        q.order_by(Transaction.timestamp.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return {
        "transactions": [txn_to_dict(t) for t in txns],
        "total":        total,
        "page":         page,
        "per_page":     per_page,
        "pages":        math.ceil(total / per_page) if total else 1,
    }


@app.get("/alerts", tags=["Alerts"])
async def get_alerts(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return high-score transactions for the alerts panel (score ≥ 0.4)."""
    alerts = (
        db.query(Transaction)
        .filter(Transaction.fraud_score >= 0.4)
        .order_by(Transaction.fraud_score.desc())
        .limit(limit)
        .all()
    )
    return {"alerts": [txn_to_dict(t) for t in alerts]}


@app.get("/fraud-by-hour", tags=["Dashboard"])
async def fraud_by_hour(db: Session = Depends(get_db)):
    """Aggregate fraud/review/safe counts per hour over the last 24 hours."""
    since = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    txns  = db.query(Transaction).filter(Transaction.timestamp >= since).all()

    buckets: dict = {}
    for txn in txns:
        h = txn.timestamp.strftime("%H:00")
        if h not in buckets:
            buckets[h] = {"hour": h, "fraud": 0, "review": 0, "safe": 0}
        key = txn.status.lower()
        if key in buckets[h]:
            buckets[h][key] += 1

    # Ensure all 24 hours appear even if empty
    all_hours = [f"{i:02d}:00" for i in range(24)]
    result    = [buckets.get(h, {"hour": h, "fraud": 0, "review": 0, "safe": 0}) for h in all_hours]
    return {"data": result}


@app.get("/model/metrics", tags=["Model"])
async def model_metrics():
    """Return the evaluation metrics saved at training time."""
    return ml_metrics


@app.get("/model/feature-importance", tags=["Model"])
async def feature_importance(top: int = Query(15, ge=5, le=30)):
    """Return the top N most important XGBoost features."""
    items = list(ml_importance.items())[:top]
    return {
        "features": [
            {"feature": k, "importance": round(v, 4)}
            for k, v in items
        ]
    }


@app.post("/explain", tags=["Explanation"])
async def explain(req: ExplainRequest):
    """
    Use LangChain + OpenAI GPT to explain WHY a transaction was classified
    as Fraud, Review, or Safe — in plain English.

    Requires OPENAI_API_KEY in backend/.env
    """
    from explainer import explain_transaction

    v = (list(req.features) + [0.0] * 28)[:28]

    try:
        text = explain_transaction(
            txn_id            = req.txn_id,
            amount            = req.amount,
            fraud_score       = req.fraud_score,
            status            = req.status,
            feature_importance= ml_importance,
            v_features        = v,
        )
        return {"explanation": text}
    except ValueError as e:
        # API key not configured
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

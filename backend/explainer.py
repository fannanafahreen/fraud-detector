"""
explainer.py — LangChain-powered natural language explanations for fraud predictions.

Uses OpenAI GPT to explain WHY the XGBoost model flagged a transaction as Fraud,
Review, or Safe — in plain English that a non-technical user can understand.
"""

import os
from dotenv import load_dotenv

load_dotenv()  # reads OPENAI_API_KEY from .env file

# ── LangChain imports ─────────────────────────────────────────────────────────
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# ── Model setup ───────────────────────────────────────────────────────────────
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Lazy-initialised so the app starts even without an API key
_llm = None

def _get_llm():
    """Return the LLM instance, creating it once on first use."""
    global _llm
    if _llm is None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key or api_key.startswith("sk-your"):
            raise ValueError(
                "OPENAI_API_KEY is not set. "
                "Add it to backend/.env  (see .env.example)."
            )
        _llm = ChatOpenAI(
            model       = OPENAI_MODEL,
            temperature = 0.4,        # slightly creative but mostly factual
            api_key     = api_key,
        )
    return _llm


# ── Prompt template ───────────────────────────────────────────────────────────
# The prompt is carefully engineered so GPT gives a concise, structured answer
# rather than a generic response.
_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a fraud analyst AI assistant for a credit card fraud detection system.
Your job is to explain in plain English why a transaction was classified the way it was.

Be concise (3-5 sentences). Structure your answer as:
1. What the classification means
2. Which specific features most influenced the decision
3. What action (if any) should be taken

Use simple language. Avoid technical jargon. Be direct.""",
    ),
    (
        "human",
        """A credit card transaction was analysed with the following details:

Transaction ID : {txn_id}
Amount         : €{amount}
Fraud Score    : {fraud_score} (0 = definitely safe, 1 = definitely fraud)
Classification : {status}
Top Features   : {top_features}

Explain this classification to a fraud analyst.""",
    ),
])

_CHAIN = _PROMPT | StrOutputParser()   # prompt → LLM → plain string output


# ── Public API ────────────────────────────────────────────────────────────────
def explain_transaction(
    txn_id:       str,
    amount:       float,
    fraud_score:  float,
    status:       str,
    feature_importance: dict,    # {feature_name: importance_score} from model
    v_features:   list[float],   # actual V1-V28 values for this transaction
) -> str:
    """
    Generate a natural language explanation for a fraud prediction.

    Returns a plain-text explanation string.
    Raises ValueError if OPENAI_API_KEY is not configured.
    """
    llm = _get_llm()

    # Build a human-readable summary of the top contributing features.
    # We multiply the model's global importance by the absolute feature value
    # to estimate how much each feature contributed to THIS transaction.
    feature_names = [f"V{i}" for i in range(1, 29)]
    contributions = {}
    for i, (name, val) in enumerate(zip(feature_names, v_features)):
        global_importance = feature_importance.get(name, 0)
        contributions[name] = round(global_importance * abs(val), 4)

    # Top 5 contributing features for this specific transaction
    top5 = sorted(contributions.items(), key=lambda x: x[1], reverse=True)[:5]
    top_features_str = ", ".join(
        f"{name}={v_features[int(name[1:])-1]:.2f} (importance: {score:.4f})"
        for name, score in top5
    )

    chain = _PROMPT | _get_llm() | StrOutputParser()

    explanation = chain.invoke({
        "txn_id":       txn_id,
        "amount":       f"{amount:.2f}",
        "fraud_score":  f"{fraud_score:.4f}",
        "status":       status,
        "top_features": top_features_str,
    })

    return explanation.strip()

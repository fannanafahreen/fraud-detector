"""
database.py — SQLAlchemy setup for storing all transactions.
"""

import datetime
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./fraud_detection.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite + FastAPI threads
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Transaction(Base):
    """One credit-card transaction stored after prediction."""
    __tablename__ = "transactions"

    id           = Column(Integer, primary_key=True, index=True, autoincrement=True)
    txn_id       = Column(String,  unique=True, index=True)   # e.g. "TXN-1042"
    amount       = Column(Float)
    time_seconds = Column(Float)
    fraud_score  = Column(Float)                               # XGBoost probability 0–1
    status       = Column(String)                              # "Fraud" | "Review" | "Safe"
    timestamp    = Column(DateTime, default=datetime.datetime.utcnow)


def create_tables():
    """Create all tables if they do not already exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency: yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

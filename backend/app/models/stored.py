from sqlalchemy import Column, String, Text, DateTime, Date, Float, Integer, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class StoredAddress(Base):
    """A workspace's Blockradar address, kept so restarts don't need a full re-download."""
    __tablename__ = "stored_addresses"

    org_id         = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    id             = Column(String, primary_key=True)          # Blockradar address id
    data           = Column(Text, nullable=False)              # trimmed JSON of the API object
    balance_usd    = Column(Float, nullable=False, default=0.0)
    balance_symbol = Column(String, nullable=False, default="")
    updated_at     = Column(DateTime, server_default=func.now())


class StoredTransaction(Base):
    """A workspace's Blockradar transaction (trimmed). Upserted by (org_id, id)."""
    __tablename__ = "stored_transactions"

    org_id     = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    id         = Column(String, primary_key=True)
    status     = Column(String, nullable=False, index=True)    # PENDING | SUCCESS | FAILED | CANCELLED
    created_at = Column(DateTime, nullable=True, index=True)   # transaction time (naive UTC)
    data       = Column(Text, nullable=False)
    updated_at = Column(DateTime, server_default=func.now())


class Snapshot(Base):
    """One row per workspace per UTC day: the headline metrics, for trend charts."""
    __tablename__ = "daily_snapshots"

    org_id            = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    day               = Column(Date, primary_key=True)
    total_wallets     = Column(Integer, nullable=False, default=0)
    active_wallets    = Column(Integer, nullable=False, default=0)
    dormant_wallets   = Column(Integer, nullable=False, default=0)
    never_active      = Column(Integer, nullable=False, default=0)
    dormancy_rate     = Column(Float, nullable=False, default=0.0)
    total_volume_usd  = Column(Float, nullable=False, default=0.0)
    transactions      = Column(Integer, nullable=False, default=0)
    fintechs          = Column(Integer, nullable=False, default=0)
    high_risk         = Column(Integer, nullable=False, default=0)
    medium_risk       = Column(Integer, nullable=False, default=0)
    low_risk          = Column(Integer, nullable=False, default=0)
    unscored          = Column(Integer, nullable=False, default=0)
    health_score      = Column(Float, nullable=True)


class FintechDaily(Base):
    """One row per fintech per UTC day: its risk and key metrics. Powers per-fintech trends, and is
    the history a future trained churn model will learn from."""
    __tablename__ = "fintech_daily"

    org_id            = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    fintech_id        = Column(String, primary_key=True)
    day               = Column(Date, primary_key=True)
    fintech_name      = Column(String, nullable=False, default="")
    risk              = Column(String, nullable=False, default="Unknown")
    probability       = Column(Float, nullable=False, default=0.0)
    total_volume_usd  = Column(Float, nullable=False, default=0.0)
    transactions      = Column(Integer, nullable=False, default=0)
    days_since_last_tx = Column(Integer, nullable=False, default=0)

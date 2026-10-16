from sqlalchemy import Column, String, Integer, DateTime, Date, ForeignKey, Index
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class ApiKey(Base):
    """
    An API key for the public API. Only a SHA-256 hash is stored, so a database leak can't be replayed;
    the full key is shown once at creation. `prefix` is a safe-to-display fragment for recognising it.
    """
    __tablename__ = "api_keys"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id       = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    name         = Column(String, nullable=False)
    prefix       = Column(String, nullable=False)
    key_hash     = Column(String, unique=True, index=True, nullable=False)
    mode         = Column(String, nullable=False, default="live")        # live: your data, billed. test: demo data, free
    created_by   = Column(String, nullable=True)
    created_at   = Column(DateTime, server_default=func.now())
    last_used_at = Column(DateTime, nullable=True)
    revoked_at   = Column(DateTime, nullable=True)


class CreditTransaction(Base):
    """Money in (top-ups) and manual adjustments. Usage is aggregated in ApiUsageDaily instead of one row per call."""
    __tablename__ = "credit_transactions"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id        = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    delta         = Column(Integer, nullable=False)
    kind          = Column(String, nullable=False)                        # topup | adjustment
    ref           = Column(String, unique=True, nullable=True)            # Stripe session id: a replayed webhook cannot credit twice
    note          = Column(String, nullable=True)
    balance_after = Column(Integer, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


class ApiUsageDaily(Base):
    __tablename__ = "api_usage_daily"

    org_id   = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    day      = Column(Date, primary_key=True)
    endpoint = Column(String, primary_key=True)
    calls    = Column(Integer, nullable=False, default=0)
    credits  = Column(Integer, nullable=False, default=0)

    __table_args__ = (Index("ix_api_usage_org_day", "org_id", "day"),)

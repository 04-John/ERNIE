from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class RiskState(Base):
    """Last known risk tier per fintech. Comparing against it after each sync is how transitions are detected."""
    __tablename__ = "risk_states"

    org_id        = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    fintech_id    = Column(String, primary_key=True)
    fintech_name  = Column(String, nullable=False, default="")
    risk          = Column(String, nullable=False, default="Unknown")
    probability   = Column(Float, nullable=False, default=0.0)
    updated_at    = Column(DateTime, server_default=func.now())
    last_alert_at = Column(DateTime, nullable=True)       # throttles repeat alerts for a flapping fintech


class AlertEvent(Base):
    """Something worth telling the team about. Persisted so the bell can show history."""
    __tablename__ = "alert_events"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id       = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    kind         = Column(String, nullable=False)          # high_risk | recovered | sync_failed
    fintech_id   = Column(String, nullable=True)
    fintech_name = Column(String, nullable=True)
    title        = Column(String, nullable=False)
    detail       = Column(Text, nullable=True)
    created_at   = Column(DateTime, server_default=func.now(), index=True)


class AlertChannel(Base):
    """Where alerts are delivered. The target (an email address or a webhook URL) is encrypted at rest."""
    __tablename__ = "alert_channels"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id        = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    kind          = Column(String, nullable=False)         # email | slack | webhook
    label         = Column(String, nullable=False, default="")
    target_enc    = Column(Text, nullable=False)
    target_hint   = Column(String, nullable=False, default="")   # safe-to-display fragment
    secret_enc    = Column(Text, nullable=True)            # webhook signing secret
    enabled       = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime, server_default=func.now())
    last_sent_at  = Column(DateTime, nullable=True)
    last_error    = Column(Text, nullable=True)

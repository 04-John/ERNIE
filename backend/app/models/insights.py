from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey
from app.core.database import Base


class InsightRecord(Base):
    """
    A finding shown to a workspace. One row per insight key; `resolved_at` is set when the condition stops
    being true and `dismissed_at` when a user hides it. A dismissed insight stays hidden while it keeps being
    detected; a changed situation produces a different key, so it comes back as a new insight.
    """
    __tablename__ = "insight_records"

    org_id      = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    key         = Column(String, primary_key=True)
    kind        = Column(String, nullable=False)
    severity    = Column(String, nullable=False)
    title       = Column(String, nullable=False)
    detail      = Column(Text, nullable=True)
    action      = Column(Text, nullable=True)
    fintech_ids = Column(Text, nullable=False, default="[]")      # JSON
    evidence    = Column(Text, nullable=False, default="{}")      # JSON
    priority    = Column(Float, nullable=False, default=0.0)
    first_seen  = Column(DateTime, nullable=False)
    last_seen   = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)

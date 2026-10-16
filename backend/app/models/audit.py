from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class AuditEvent(Base):
    """Who did what in a workspace. Append-only; never contains secrets (keys, tokens, webhook URLs)."""
    __tablename__ = "audit_events"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id      = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    actor_id    = Column(String, nullable=True)
    actor_email = Column(String, nullable=True)       # kept as text so the trail survives the user being removed
    action      = Column(String, nullable=False)      # e.g. "member.removed"
    detail      = Column(String, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_audit_org_created", "org_id", "created_at"),)

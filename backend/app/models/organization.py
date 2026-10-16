from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Organization(Base):
    """A workspace. Every user belongs to exactly one; all analytics data is scoped to it."""
    __tablename__ = "organizations"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class BlockradarConnection(Base):
    """A workspace's Blockradar credentials. The API key is stored encrypted and never returned."""
    __tablename__ = "blockradar_connections"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id         = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    api_key_enc    = Column(Text, nullable=False)
    api_key_last4  = Column(String(4), nullable=False)
    wallet_id      = Column(String, nullable=False)
    created_at     = Column(DateTime, server_default=func.now())
    last_synced_at = Column(DateTime, nullable=True)
    last_error     = Column(Text, nullable=True)

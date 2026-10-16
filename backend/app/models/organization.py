from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Organization(Base):
    """A workspace. Every user belongs to exactly one; all analytics data is scoped to it."""
    __tablename__ = "organizations"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    ai_enabled = Column(Boolean, nullable=False, default=False, server_default="0")   # opt-in to the AI assistant
    plan       = Column(String, nullable=False, default="free", server_default="free")


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
    last_full_sync_at = Column(DateTime, nullable=True)   # last complete (non-incremental) transaction fetch


class Invite(Base):
    """
    A one-time invitation to join a workspace. Only a SHA-256 hash of the token is stored,
    so a database leak can't be used to join workspaces; the link is shown once at creation.
    """
    __tablename__ = "invites"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id      = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash  = Column(String, unique=True, index=True, nullable=False)
    email       = Column(String, nullable=True)           # if set, only this address may accept
    role        = Column(String, nullable=False, default="member")
    created_by  = Column(String, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    expires_at  = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at  = Column(DateTime, nullable=True)

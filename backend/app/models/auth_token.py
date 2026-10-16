from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class AuthToken(Base):
    """
    One-time tokens emailed to users (password reset, email verification).
    Only a SHA-256 hash is stored, so a database leak can't be used to take over accounts.
    """
    __tablename__ = "auth_tokens"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    purpose    = Column(String, nullable=False)                 # "reset" | "verify"
    token_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    used_at    = Column(DateTime, nullable=True)

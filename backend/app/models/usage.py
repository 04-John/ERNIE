from sqlalchemy import Column, String, Integer, ForeignKey
from app.core.database import Base


class AiUsage(Base):
    """AI assistant usage per workspace per calendar month (UTC), for plan limits and cost visibility."""
    __tablename__ = "ai_usage"

    org_id        = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    month         = Column(String, primary_key=True)                 # "2026-10"
    messages      = Column(Integer, nullable=False, default=0)
    input_tokens  = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)

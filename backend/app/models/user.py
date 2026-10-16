from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email        = Column(String, unique=True, index=True, nullable=False)
    name         = Column(String, nullable=True)
    company      = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # nullable for Google OAuth users
    google_id    = Column(String, nullable=True, unique=True)
    is_active    = Column(Boolean, default=True)
    is_verified  = Column(Boolean, default=False)
    created_at   = Column(DateTime, server_default=func.now())
    last_login   = Column(DateTime, nullable=True)

    # Multi-tenancy: each user belongs to one organization (workspace)
    org_id       = Column(String, ForeignKey("organizations.id"), index=True, nullable=True)
    role         = Column(String, nullable=False, default="admin", server_default="admin")  # admin | member

    def __repr__(self):
        return f"<User {self.email}>"

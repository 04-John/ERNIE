"""
Auth Service
============
Password hashing (bcrypt), JWT creation/verification, user lookups,
a FastAPI dependency that protects routes, and a tiny login rate limiter.
"""

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User
from app.services.tenancy import create_org, default_org_name, seed_env_connection

settings = get_settings()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day
MIN_PASSWORD_LENGTH = 8


# ─────────────────────────────────────────────
# PASSWORD
# ─────────────────────────────────────────────

def _pw_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(plain), hashed.encode())
    except ValueError:
        return False


# ─────────────────────────────────────────────
# JWT TOKENS
# ─────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def verify_token(token: str):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ─────────────────────────────────────────────
# USER OPERATIONS
# ─────────────────────────────────────────────

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_google_id(db: Session, google_id: str) -> Optional[User]:
    return db.query(User).filter(User.google_id == google_id).first()


def create_user(
    db: Session,
    email: str,
    name: str = "",
    company: str = "",
    password: str = None,
    google_id: str = None,
) -> User:
    email = email.strip().lower()
    # every signup starts its own workspace and is its admin
    org = create_org(db, default_org_name(name, company, email))
    user = User(
        email=email,
        name=name,
        company=company,
        hashed_password=hash_password(password) if password else None,
        google_id=google_id,
        is_verified=True if google_id else False,
        org_id=org.id,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    seed_env_connection(db, user)
    return user


# Pre-computed hash so unknown-email logins cost the same as wrong-password ones
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user or not user.hashed_password:
        verify_password(password, _DUMMY_HASH)
        return None
    if not user.is_active or not verify_password(password, user.hashed_password):
        return None
    return user


def update_last_login(db: Session, user: User) -> None:
    user.last_login = datetime.now(timezone.utc)
    db.commit()


# ─────────────────────────────────────────────
# ROUTE PROTECTION
# ─────────────────────────────────────────────

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: require a valid `Authorization: Bearer <jwt>` header."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized
    payload = verify_token(authorization[7:])
    if not payload or not payload.get("sub"):
        raise unauthorized
    user = get_user_by_id(db, payload["sub"])
    if not user or not user.is_active:
        raise unauthorized
    return user


# ─────────────────────────────────────────────
# RATE LIMIT (in-memory, per client IP — single-process only)
# ─────────────────────────────────────────────

_attempts: dict = defaultdict(deque)


def rate_limit_auth(request: Request, limit: int = 10, window: int = 60) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    q = _attempts[ip]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in a minute.",
        )
    q.append(now)

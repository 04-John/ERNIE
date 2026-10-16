"""
Auth Service
============
Password hashing (bcrypt), JWT creation/verification, user lookups,
a FastAPI dependency that protects routes, and a tiny login rate limiter.
"""

import hashlib
import secrets
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
from app.models.auth_token import AuthToken
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
    to_encode.update({"exp": expire, "iat": int(datetime.now(timezone.utc).timestamp())})
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
    org_id: Optional[str] = None,
    role: str = "admin",
) -> User:
    email = email.strip().lower()
    # a plain signup starts its own workspace (and is its admin); an invited one joins the inviter's
    if org_id is None:
        org_id = create_org(db, default_org_name(name, company, email)).id
    user = User(
        email=email,
        name=name,
        company=company,
        hashed_password=hash_password(password) if password else None,
        google_id=google_id,
        is_verified=True if google_id else False,
        org_id=org_id,
        role=role,
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
    # a password change/reset invalidates every session issued before it
    if user.password_changed_at:
        changed = int(user.password_changed_at.replace(tzinfo=timezone.utc).timestamp())
        if int(payload.get("iat", 0)) < changed:
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


# ─────────────────────────────────────────────
# RATE LIMIT BY KEY (e.g. per email address, so one inbox can't be flooded)
# ─────────────────────────────────────────────

_key_attempts: dict = defaultdict(deque)


def rate_limit_key(key: str, limit: int, window: int) -> bool:
    """True if this attempt is allowed; records it. Single-process, in-memory."""
    now = time.monotonic()
    q = _key_attempts[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


# ─────────────────────────────────────────────
# ONE-TIME EMAIL TOKENS (password reset / email verification)
# ─────────────────────────────────────────────

RESET_TTL = timedelta(hours=1)
VERIFY_TTL = timedelta(hours=48)


def _naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_auth_token(db: Session, user: User, purpose: str) -> str:
    """Create a one-time token (returned once, stored hashed). Older unused tokens of that purpose die."""
    now = _naive_now()
    db.query(AuthToken).filter(
        AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None)
    ).update({"used_at": now})
    token = secrets.token_urlsafe(32)
    ttl = RESET_TTL if purpose == "reset" else VERIFY_TTL
    db.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=_hash_token(token), expires_at=now + ttl))
    db.commit()
    return token


def consume_auth_token(db: Session, token: str, purpose: str) -> Optional[User]:
    """Validate and burn a token atomically. Returns the user, or None if invalid/expired/used."""
    if not token or len(token) > 200:
        return None
    row = db.query(AuthToken).filter(AuthToken.token_hash == _hash_token(token), AuthToken.purpose == purpose).first()
    now = _naive_now()
    if not row or row.used_at or row.expires_at <= now:
        return None
    burned = db.query(AuthToken).filter(AuthToken.id == row.id, AuthToken.used_at.is_(None)).update({"used_at": now})
    db.commit()
    if not burned:                       # lost a race with another request using the same token
        return None
    user = get_user_by_id(db, row.user_id)
    return user if user and user.is_active else None


def set_password(db: Session, user: User, password: str) -> None:
    """Set a new password, end all existing sessions, and mark the email verified (the user proved control of it)."""
    user.hashed_password = hash_password(password)
    user.password_changed_at = _naive_now()
    user.is_verified = True
    db.commit()


def link_google_account(db: Session, user: User, google_id: str) -> None:
    """
    Attach a Google identity to an existing account. Google has verified this email, so if the
    account was created with a password but never verified, that password may belong to someone
    else who registered the address first (account pre-hijacking). Drop it and end old sessions.
    """
    user.google_id = google_id
    if not user.is_verified and user.hashed_password:
        user.hashed_password = None
        user.password_changed_at = _naive_now()
    user.is_verified = True
    db.commit()

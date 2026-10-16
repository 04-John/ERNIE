"""
Tenancy
=======
Workspaces (organizations), their Blockradar connections, and the startup
migration that upgrades a single-tenant database to multi-tenant.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import engine
from app.models.organization import Organization, BlockradarConnection, Invite
from app.models.user import User
from app.services import crypto
from app.services.blockradar import Creds, CredentialError

settings = get_settings()


# ─────────────────────────────────────────────
# WORKSPACES
# ─────────────────────────────────────────────

def default_org_name(name: Optional[str], company: Optional[str], email: str) -> str:
    if company and company.strip():
        return company.strip()[:120]
    base = (name or "").strip() or email.split("@")[0]
    return f"{base}'s workspace"[:120]


def create_org(db: Session, name: str) -> Organization:
    org = Organization(name=name)
    db.add(org)
    db.flush()  # assigns org.id without committing
    return org


# ─────────────────────────────────────────────
# CONNECTIONS
# ─────────────────────────────────────────────

def get_connection(db: Session, org_id: Optional[str]) -> Optional[BlockradarConnection]:
    if not org_id:
        return None
    return db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).first()


def creds_from_connection(conn: BlockradarConnection) -> Creds:
    return Creds(api_key=crypto.decrypt(conn.api_key_enc), wallet_id=conn.wallet_id)


def save_connection(db: Session, org_id: str, creds: Creds) -> BlockradarConnection:
    conn = get_connection(db, org_id)
    if conn is None:
        conn = BlockradarConnection(org_id=org_id, api_key_enc="", api_key_last4="", wallet_id="")
        db.add(conn)
    conn.api_key_enc = crypto.encrypt(creds.api_key)
    conn.api_key_last4 = creds.api_key[-4:]
    conn.wallet_id = creds.wallet_id
    conn.last_error = None
    conn.last_synced_at = None
    db.commit()
    db.refresh(conn)
    return conn


def delete_connection(db: Session, org_id: str) -> bool:
    conn = get_connection(db, org_id)
    if not conn:
        return False
    db.delete(conn)
    db.commit()
    return True


def mask_wallet_id(wallet_id: str) -> str:
    return f"{wallet_id[:8]}…{wallet_id[-4:]}" if len(wallet_id) > 14 else wallet_id


def seed_env_connection(db: Session, user: User) -> bool:
    """
    Self-hosting convenience: if BOOTSTRAP_ADMIN_EMAIL matches this user and the
    BLOCKRADAR_* env vars are set, connect their workspace once. Never overwrites.
    """
    boot = settings.bootstrap_admin_email.strip().lower()
    if not boot or user.email.lower() != boot or not user.org_id:
        return False
    if get_connection(db, user.org_id):
        return False
    try:
        creds = Creds.validate_format(settings.blockradar_api_key, settings.blockradar_wallet_id)
    except CredentialError:
        return False
    save_connection(db, user.org_id, creds)
    print(f"  OK seeded Blockradar connection for {boot} from environment")
    return True


# ─────────────────────────────────────────────
# INVITES
# ─────────────────────────────────────────────

INVITE_TTL_DAYS = 7
MAX_PENDING_INVITES = 20
VALID_ROLES = ("admin", "member")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)   # DB stores naive UTC


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def pending_invites(db: Session, org_id: str):
    return (
        db.query(Invite)
        .filter(Invite.org_id == org_id, Invite.accepted_at.is_(None), Invite.revoked_at.is_(None), Invite.expires_at > _now())
        .order_by(Invite.created_at.desc())
        .all()
    )


def create_invite(db: Session, org_id: str, created_by: str, email: Optional[str], role: str) -> Tuple[Invite, str]:
    """Returns (invite, plaintext_token). The token is not recoverable afterwards."""
    token = secrets.token_urlsafe(32)
    invite = Invite(
        org_id=org_id, created_by=created_by, role=role,
        email=email.strip().lower() if email else None,
        token_hash=_hash_token(token),
        expires_at=_now() + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite, token


def find_valid_invite(db: Session, token: str) -> Optional[Invite]:
    if not token or len(token) > 200:
        return None
    inv = db.query(Invite).filter(Invite.token_hash == _hash_token(token)).first()
    if not inv or inv.accepted_at or inv.revoked_at or inv.expires_at <= _now():
        return None
    return inv


def mark_invite_accepted(db: Session, invite: Invite) -> None:
    invite.accepted_at = _now()
    db.commit()


# ─────────────────────────────────────────────
# MIGRATION (single-tenant -> multi-tenant)
# ─────────────────────────────────────────────

def run_migrations(db: Session) -> None:
    """
    Idempotent. create_all() adds new tables but never alters existing ones, so the
    new users.org_id / users.role columns are added here, then every user without a
    workspace gets one (they become its admin).
    """
    insp = inspect(engine)
    if "users" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("users")}
        with engine.begin() as conn:
            if "org_id" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN org_id VARCHAR"))
            if "password_changed_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP"))
            if "role" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'admin'"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_org_id ON users (org_id)"))

    if "organizations" in insp.get_table_names():
        ocols = {c["name"] for c in insp.get_columns("organizations")}
        if "ai_enabled" not in ocols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE organizations ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
        if "plan" not in ocols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE organizations ADD COLUMN plan VARCHAR NOT NULL DEFAULT 'free'"))

    if "daily_snapshots" in insp.get_table_names():
        scols = {c["name"] for c in insp.get_columns("daily_snapshots")}
        if "health_score" not in scols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE daily_snapshots ADD COLUMN health_score FLOAT"))

    if "blockradar_connections" in insp.get_table_names():
        ccols = {c["name"] for c in insp.get_columns("blockradar_connections")}
        if "last_full_sync_at" not in ccols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE blockradar_connections ADD COLUMN last_full_sync_at TIMESTAMP"))

    orphans = db.query(User).filter(User.org_id.is_(None)).all()
    for user in orphans:
        org = create_org(db, default_org_name(user.name, user.company, user.email))
        user.org_id = org.id
        user.role = "admin"
    if orphans:
        db.commit()
        print(f"  OK created workspaces for {len(orphans)} existing user(s)")

    for user in db.query(User).filter(User.org_id.isnot(None)).all():
        seed_env_connection(db, user)

"""
API access: keys, the prepaid credit wallet, and metering.

Pricing lives here as plain data. One credit is worth $0.001, so a customer who tops up $10 gets 10,000
credits, and each call costs a fixed number of credits by endpoint. Rationale: derived analytics (a risk
score with its reasons) is worth far more per call than raw chain reads, which providers sell for fractions of a
cent, and costs us almost nothing to serve, so prices start low and flat and are meant to be tuned once real
usage shows up. Bigger top-ups earn a bonus.

Safety rules (each is covered by a test):
  * Keys are stored hashed, shown once, and can be revoked at any time.
  * Spending is one atomic conditional UPDATE: concurrent calls can never overspend the wallet.
  * Calls are charged only after they succeed; errors and "not found" are free.
  * A replayed Stripe webhook can never credit twice (the Stripe session id is unique).
  * Test keys read the demo dataset and never touch the wallet.
"""

import hashlib
import secrets
from datetime import date, datetime
from typing import List, Optional, Tuple

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.apiaccess import ApiKey, ApiUsageDaily, CreditTransaction
from app.models.organization import Organization

CREDIT_USD = 0.001
MAX_ACTIVE_KEYS = 10

ENDPOINT_COSTS = {            # credits per successful call
    "health": 2,
    "insights": 2,
    "history": 5,
    "fintechs.list": 5,
    "fintechs.get": 10,
}

TOPUP_PACKS = [               # usd -> credits (bonus grows with size)
    {"usd": 10, "credits": 10_000},
    {"usd": 50, "credits": 55_000},
    {"usd": 200, "credits": 240_000},
]

RATE_LIMITS_PER_MINUTE = {"live": 300, "test": 30}


def pack_for(usd: int) -> Optional[dict]:
    return next((p for p in TOPUP_PACKS if p["usd"] == usd), None)


def public_pricing() -> dict:
    return {"credit_usd": CREDIT_USD, "endpoints": ENDPOINT_COSTS, "packs": TOPUP_PACKS,
            "rate_limits_per_minute": RATE_LIMITS_PER_MINUTE}


# ───────────────────────── keys ─────────────────────────

def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create_key(db: Session, org_id: str, name: str, mode: str, created_by: Optional[str]) -> Tuple[ApiKey, str]:
    """Returns (row, plaintext). The plaintext is not recoverable afterwards."""
    plain = f"ernie_{mode}_{secrets.token_urlsafe(32)}"
    row = ApiKey(org_id=org_id, name=name.strip()[:60] or "Untitled key", prefix=plain[:15], key_hash=_hash(plain),
                 mode=mode, created_by=created_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, plain


def active_keys(db: Session, org_id: str) -> List[ApiKey]:
    return (db.query(ApiKey).filter(ApiKey.org_id == org_id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc()).all())


def authenticate(db: Session, token: Optional[str]) -> Optional[ApiKey]:
    if not token or not token.startswith("ernie_") or len(token) > 120:
        return None
    key = db.query(ApiKey).filter(ApiKey.key_hash == _hash(token)).first()
    if key is None or key.revoked_at is not None:
        return None
    return key


def touch(db: Session, key: ApiKey) -> None:
    key.last_used_at = datetime.utcnow()
    db.commit()


# ───────────────────────── wallet ─────────────────────────

def balance(db: Session, org_id: str) -> int:
    value = db.query(Organization.credits).filter(Organization.id == org_id).scalar()      # a column query always reads the database
    return int(value or 0)


def spend(db: Session, org_id: str, cost: int, endpoint: str) -> Optional[int]:
    """Take `cost` credits if the wallet has them. Returns the new balance, or None if it can't cover it."""
    if cost <= 0:
        return balance(db, org_id)
    result = db.execute(update(Organization).where(Organization.id == org_id, Organization.credits >= cost)
                        .values(credits=Organization.credits - cost))
    if result.rowcount == 0:
        db.rollback()
        return None
    _count(db, org_id, endpoint, cost)
    db.commit()
    return balance(db, org_id)


def _count(db: Session, org_id: str, endpoint: str, credits: int) -> None:
    today = date.today()
    for attempt in (1, 2):
        row = db.query(ApiUsageDaily).filter(ApiUsageDaily.org_id == org_id, ApiUsageDaily.day == today,
                                             ApiUsageDaily.endpoint == endpoint).first()
        try:
            if row is None:
                db.add(ApiUsageDaily(org_id=org_id, day=today, endpoint=endpoint, calls=1, credits=credits))
                db.flush()
            else:
                row.calls += 1
                row.credits += credits
            return
        except IntegrityError:           # two first calls of the day raced; the second retries as an update
            db.rollback()
            if attempt == 2:
                raise


def count_free_call(db: Session, org_id: str, endpoint: str) -> None:
    _count(db, org_id, endpoint, 0)
    db.commit()


def credit(db: Session, org_id: str, credits: int, kind: str, ref: Optional[str], note: str) -> bool:
    """Add credits. Returns False (and changes nothing) if this `ref` was already applied."""
    if ref and db.query(CreditTransaction).filter(CreditTransaction.ref == ref).first():
        return False
    db.execute(update(Organization).where(Organization.id == org_id).values(credits=Organization.credits + credits))
    new_balance = balance(db, org_id)
    db.add(CreditTransaction(org_id=org_id, delta=credits, kind=kind, ref=ref, note=note[:200], balance_after=new_balance))
    try:
        db.commit()
    except IntegrityError:               # a concurrent duplicate delivery won the race
        db.rollback()
        return False
    return True


def usage_summary(db: Session, org_id: str, days: int = 30) -> dict:
    since = date.fromordinal(date.today().toordinal() - days + 1)
    rows = db.query(ApiUsageDaily).filter(ApiUsageDaily.org_id == org_id, ApiUsageDaily.day >= since).order_by(ApiUsageDaily.day).all()
    by_day, by_endpoint = {}, {}
    for r in rows:
        d = by_day.setdefault(r.day.isoformat(), {"day": r.day.isoformat(), "calls": 0, "credits": 0})
        d["calls"] += r.calls
        d["credits"] += r.credits
        e = by_endpoint.setdefault(r.endpoint, {"endpoint": r.endpoint, "calls": 0, "credits": 0})
        e["calls"] += r.calls
        e["credits"] += r.credits
    return {"days": list(by_day.values()), "endpoints": sorted(by_endpoint.values(), key=lambda x: -x["calls"]),
            "total_calls": sum(r.calls for r in rows), "total_credits": sum(r.credits for r in rows)}


def recent_transactions(db: Session, org_id: str, limit: int = 20) -> List[dict]:
    rows = (db.query(CreditTransaction).filter(CreditTransaction.org_id == org_id)
            .order_by(CreditTransaction.created_at.desc()).limit(limit).all())
    return [{"id": r.id, "kind": r.kind, "credits": r.delta, "note": r.note, "balance_after": r.balance_after,
             "at": (r.created_at.isoformat() + "Z") if r.created_at else None} for r in rows]

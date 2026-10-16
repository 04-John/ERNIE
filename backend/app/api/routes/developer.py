"""
Developer console routes (for signed-in people managing API access)
===================================================================
GET    /developer                overview: keys, credit balance, prices, whether top-ups are available
POST   /developer/keys           create a key; the full key is returned ONCE                [admin]
DELETE /developer/keys/{id}      revoke a key                                               [admin]
GET    /developer/usage?days=    calls and credits by day and endpoint, and recent top-ups
POST   /developer/topup          buy credits through Stripe Checkout -> {url}               [admin]
"""

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.apiaccess import ApiKey
from app.models.organization import Organization
from app.models.user import User
from app.services import apiaccess, audit, billing
from app.services.auth import get_current_user, rate_limit_auth

router = APIRouter()


class KeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    mode: Literal["live", "test"] = "live"


class TopupRequest(BaseModel):
    usd: int


def _iso(dt):
    return (dt.isoformat() + "Z") if dt else None


def _key_view(k: ApiKey) -> dict:
    return {"id": k.id, "name": k.name, "prefix": k.prefix, "mode": k.mode, "created_at": _iso(k.created_at), "last_used_at": _iso(k.last_used_at)}


@router.get("")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "keys": [_key_view(k) for k in apiaccess.active_keys(db, user.org_id)],
        "credits": apiaccess.balance(db, user.org_id),
        "pricing": apiaccess.public_pricing(),
        "topups_available": billing.payments_enabled(),
        "max_keys": apiaccess.MAX_ACTIVE_KEYS,
    }


@router.post("/keys", dependencies=[Depends(rate_limit_auth)])
def create_key(req: KeyRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if len(apiaccess.active_keys(db, user.org_id)) >= apiaccess.MAX_ACTIVE_KEYS:
        raise HTTPException(status_code=400, detail=f"You can have at most {apiaccess.MAX_ACTIVE_KEYS} active keys. Revoke one first.")
    row, plain = apiaccess.create_key(db, user.org_id, req.name, req.mode, user.id)
    audit.record(db, user.org_id, user, "api_key.created", f"Created {req.mode} API key \"{row.name}\" ({row.prefix}...)")
    return {**_key_view(row), "key": plain}          # shown once; only its hash is stored


@router.delete("/keys/{key_id}")
def revoke_key(key_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from datetime import datetime
    row = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.org_id == user.org_id, ApiKey.revoked_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Key not found.")
    row.revoked_at = datetime.utcnow()
    db.commit()
    audit.record(db, user.org_id, user, "api_key.revoked", f"Revoked API key \"{row.name}\" ({row.prefix}...)")
    return {"revoked": True}


@router.get("/usage")
def usage(days: int = Query(default=30, ge=1, le=90), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {**apiaccess.usage_summary(db, user.org_id, days), "credits": apiaccess.balance(db, user.org_id),
            "transactions": apiaccess.recent_transactions(db, user.org_id)}


@router.post("/topup", dependencies=[Depends(rate_limit_auth)])
async def topup(req: TopupRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not billing.payments_enabled():
        raise HTTPException(status_code=503, detail="Online payments aren't set up yet. Contact us to add credits.")
    pack = apiaccess.pack_for(req.usd)
    if pack is None:
        raise HTTPException(status_code=400, detail="Choose one of the listed top-up amounts.")
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    try:
        url = await asyncio.to_thread(billing.topup_url, db, org, pack, user.email)
    except Exception as e:
        print(f"[billing] top-up checkout failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Couldn't start checkout. Please try again.")
    return {"url": url}

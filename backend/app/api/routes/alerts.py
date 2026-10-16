"""
Alert Routes
============
GET    /workspace/alerts/channels            list channels                       [admin]
POST   /workspace/alerts/channels            add email / Slack / webhook         [admin]
PATCH  /workspace/alerts/channels/{id}       enable or disable                   [admin]
DELETE /workspace/alerts/channels/{id}       remove                              [admin]
POST   /workspace/alerts/channels/{id}/test  send a test message                 [admin]
GET    /workspace/alerts/events              recent alert history                [any member]

Channel targets (email addresses, webhook URLs) are encrypted at rest and never returned in full.
A webhook's signing secret is returned exactly once, when the channel is created.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.alerts import AlertChannel
from app.models.user import User
from app.services import alerts
from app.services.auth import get_current_user, rate_limit_auth

router = APIRouter()


class ChannelRequest(BaseModel):
    kind: str = Field(max_length=10)
    target: str = Field(max_length=2000)
    label: str = Field(default="", max_length=60)


class ToggleRequest(BaseModel):
    enabled: bool


def _view(c: AlertChannel) -> dict:
    return {
        "id": c.id, "kind": c.kind, "label": c.label, "hint": c.target_hint, "enabled": c.enabled,
        "created_at": (c.created_at.isoformat() + "Z") if c.created_at else None,
        "last_sent_at": (c.last_sent_at.isoformat() + "Z") if c.last_sent_at else None,
        "last_error": c.last_error,
    }


def _own(db: Session, user: User, channel_id: str) -> AlertChannel:
    c = db.query(AlertChannel).filter(AlertChannel.id == channel_id, AlertChannel.org_id == user.org_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return c


@router.get("/channels")
def list_channels(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(AlertChannel).filter(AlertChannel.org_id == user.org_id).order_by(AlertChannel.created_at).all()
    return {"data": [_view(c) for c in rows], "max": alerts.MAX_CHANNELS}


@router.post("/channels", dependencies=[Depends(rate_limit_auth)])
async def add_channel(req: ChannelRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(AlertChannel).filter(AlertChannel.org_id == user.org_id).count() >= alerts.MAX_CHANNELS:
        raise HTTPException(status_code=400, detail=f"A workspace can have at most {alerts.MAX_CHANNELS} alert channels.")
    try:
        built = await alerts.build_channel(user.org_id, req.kind, req.target, req.label)
    except alerts.ChannelError as e:
        raise HTTPException(status_code=400, detail=str(e))
    secret = built.pop("_secret_plain")
    channel = AlertChannel(org_id=user.org_id, **built)
    db.add(channel)
    db.commit()
    db.refresh(channel)
    out = _view(channel)
    if secret:
        out["secret"] = secret           # shown once: the receiver needs it to verify the signature
    return out


@router.patch("/channels/{channel_id}")
def toggle_channel(channel_id: str, req: ToggleRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _own(db, user, channel_id)
    c.enabled = req.enabled
    db.commit()
    return _view(c)


@router.delete("/channels/{channel_id}")
def remove_channel(channel_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    db.delete(_own(db, user, channel_id))
    db.commit()
    return {"removed": True}


@router.post("/channels/{channel_id}/test", dependencies=[Depends(rate_limit_auth)])
async def test_channel(channel_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    _own(db, user, channel_id)
    error = await alerts.send_test(user.org_id, channel_id)
    return {"ok": error is None, "error": error}


@router.get("/events")
async def events(limit: int = Query(default=30, ge=1, le=100), user: User = Depends(get_current_user)):
    return {"data": await asyncio.to_thread(alerts.recent_events, user.org_id, limit)}

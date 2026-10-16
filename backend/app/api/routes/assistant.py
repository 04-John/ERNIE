"""
Assistant Routes (Ask ERNIE)
============================
GET  /assistant/status          is it available / enabled for this workspace, and this month's usage
PUT  /assistant/settings        opt the workspace in or out                         [admin]
POST /assistant/chat            ask a question about the workspace's data
POST /assistant/draft-outreach  draft a message to an at-risk fintech

Off by default. Turning it on is an explicit decision by a workspace admin, because it sends
aggregated fintech metrics (never keys, addresses or emails) to Anthropic to generate answers.
"""

import asyncio
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import OrgCtx, org_ctx, require_admin
from app.core.config import get_settings
from app.core.database import get_db
from app.core.state import DEMO_KEY
from app.models.organization import Organization
from app.models.user import User
from app.services import assistant
from app.services.auth import get_current_user, rate_limit_key

settings = get_settings()
router = APIRouter()


class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: List[Msg] = Field(min_length=1, max_length=40)


class SettingsRequest(BaseModel):
    enabled: bool


class DraftRequest(BaseModel):
    fintech_id: str = Field(max_length=200)
    channel: Literal["email", "message"] = "email"


def _org(db: Session, ctx: OrgCtx) -> Organization:
    org = db.query(Organization).filter(Organization.id == ctx.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return org


def _gate(db: Session, ctx: OrgCtx, user: User) -> Organization:
    """Every check that must pass before any data leaves for the AI provider."""
    if not assistant.available():
        raise HTTPException(status_code=503, detail="The AI assistant isn't available on this server.")
    org = _org(db, ctx)
    if not org.ai_enabled:
        raise HTTPException(status_code=403, detail="The AI assistant is off for this workspace. An admin can turn it on in Settings.")
    if not rate_limit_key(f"ai:{user.id}", 20, 60):
        raise HTTPException(status_code=429, detail="You're asking quickly. Wait a few seconds and try again.")
    if assistant.used_this_month(org.id) >= settings.ai_monthly_limit:
        raise HTTPException(status_code=429, detail=f"Your workspace has used its {settings.ai_monthly_limit} AI messages for this month.")
    return org


async def _run(fn, *args):
    try:
        return await asyncio.to_thread(fn, *args)
    except assistant.AssistantError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@router.get("/status")
async def status(ctx: OrgCtx = Depends(org_ctx), db: Session = Depends(get_db)):
    org = _org(db, ctx)
    return {
        "available": assistant.available(), "enabled": bool(org.ai_enabled),
        "used": assistant.used_this_month(org.id), "limit": settings.ai_monthly_limit,
    }


@router.put("/settings")
async def set_enabled(req: SettingsRequest, admin: User = Depends(require_admin), ctx: OrgCtx = Depends(org_ctx), db: Session = Depends(get_db)):
    if req.enabled and not assistant.available():
        raise HTTPException(status_code=400, detail="The AI assistant isn't configured on this server.")
    org = _org(db, ctx)
    org.ai_enabled = req.enabled
    db.commit()
    return {"enabled": bool(org.ai_enabled)}


@router.post("/chat")
async def chat(req: ChatRequest, user: User = Depends(get_current_user), ctx: OrgCtx = Depends(org_ctx), db: Session = Depends(get_db)):
    org = _gate(db, ctx, user)
    messages = [m.model_dump() for m in req.messages]
    result = await _run(assistant.chat, ctx.state, ctx.key == DEMO_KEY, messages)
    used = assistant.record_usage(org.id, result["usage"])
    return {"reply": result["reply"], "used": used, "limit": settings.ai_monthly_limit}


@router.post("/draft-outreach")
async def draft(req: DraftRequest, user: User = Depends(get_current_user), ctx: OrgCtx = Depends(org_ctx), db: Session = Depends(get_db)):
    org = _gate(db, ctx, user)
    result = await _run(assistant.draft_outreach, ctx.state, ctx.key == DEMO_KEY, req.fintech_id, req.channel)
    used = assistant.record_usage(org.id, result["usage"])
    return {"text": result["text"], "used": used, "limit": settings.ai_monthly_limit}

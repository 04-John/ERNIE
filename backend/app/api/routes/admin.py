"""
Platform admin console (for whoever runs ERNIE, not for customers)
==================================================================
GET   /admin/overview               headline numbers
GET   /admin/workspaces?q=          workspaces with plan, members, sync health and usage
PATCH /admin/workspaces/{id}/plan   set a plan by hand (comped accounts, enterprise deals, support fixes)

Access: the signed-in user's email must be listed in PLATFORM_ADMIN_EMAILS and be verified. A normal
workspace admin is NOT a platform admin. When the list is empty these routes behave as if they do not exist.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.organization import BlockradarConnection, Organization
from app.models.usage import AiUsage
from app.models.user import User
from app.services import audit, plans
from app.services.assistant import _month
from app.services.auth import get_current_user

router = APIRouter()
settings = get_settings()


def platform_admins() -> set:
    return {e.strip().lower() for e in settings.platform_admin_emails.split(",") if e.strip()}


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() not in platform_admins() or not user.is_verified:
        raise HTTPException(status_code=404, detail="Not found.")        # 404, not 403: do not advertise that the console exists
    return user


class PlanRequest(BaseModel):
    plan: str


def _iso(dt) -> Optional[str]:
    return (dt.isoformat() + "Z") if dt else None


@router.get("/overview")
def overview(user: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    orgs = db.query(Organization).all()
    by_plan = {p: 0 for p in plans.PLANS}
    mrr = 0
    for o in orgs:
        pid = plans.plan_id(o)
        by_plan[pid] += 1
        if o.stripe_subscription_id and (o.subscription_status or "") in ("active", "trialing", "past_due"):
            mrr += plans.PLANS[pid]["price_usd"]
    now = datetime.utcnow()
    return {
        "workspaces": len(orgs), "users": db.query(User).count(),
        "connected": db.query(BlockradarConnection).count(),
        "with_sync_errors": db.query(BlockradarConnection).filter(BlockradarConnection.last_error.isnot(None)).count(),
        "by_plan": by_plan, "mrr_usd": mrr,
        "signups_7d": db.query(Organization).filter(Organization.created_at >= now - timedelta(days=7)).count(),
        "signups_30d": db.query(Organization).filter(Organization.created_at >= now - timedelta(days=30)).count(),
        "ai_messages_this_month": int(db.query(func.coalesce(func.sum(AiUsage.messages), 0)).filter(AiUsage.month == _month()).scalar() or 0),
        "note": "MRR counts workspaces with a live Stripe subscription at list price; it ignores coupons and comped plans.",
    }


@router.get("/workspaces")
def workspaces(q: str = Query(default="", max_length=100), limit: int = Query(default=100, ge=1, le=500),
               user: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    query = db.query(Organization)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        owner_ids = [u.org_id for u in db.query(User).filter(func.lower(User.email).like(like))]
        query = query.filter(func.lower(Organization.name).like(like) | Organization.id.in_(owner_ids))
    month, out = _month(), []
    for o in query.order_by(Organization.created_at.desc()).limit(limit):
        members = db.query(User).filter(User.org_id == o.id).order_by(User.created_at).all()
        conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == o.id).first()
        usage = db.query(AiUsage).filter(AiUsage.org_id == o.id, AiUsage.month == month).first()
        out.append({
            "id": o.id, "name": o.name, "plan": plans.plan_id(o), "subscription_status": o.subscription_status,
            "created_at": _iso(o.created_at), "members": len(members),
            "owner": next((m.email for m in members if m.role == "admin"), None),
            "connected": conn is not None, "last_synced_at": _iso(conn.last_synced_at) if conn else None,
            "sync_error": (conn.last_error or "")[:200] if conn and conn.last_error else None,
            "ai_messages_this_month": usage.messages if usage else 0,
        })
    return {"data": out}


@router.patch("/workspaces/{org_id}/plan")
def set_plan(org_id: str, req: PlanRequest, user: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    if req.plan not in plans.PLANS:
        raise HTTPException(status_code=400, detail=f"Plan must be one of: {', '.join(plans.PLANS)}.")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    before = org.plan
    org.plan = req.plan
    db.commit()
    audit.record(db, org.id, user, "plan.changed", f"Platform admin set the plan: {before} to {req.plan}")
    return {"id": org.id, "plan": org.plan}

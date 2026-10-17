"""
Billing Routes
==============
GET  /billing/plans     public: the plans and prices (for the pricing page)
GET  /billing           the workspace's billing state and whether paid checkout is available   [signed in]
POST /billing/checkout  start a Stripe Checkout for a paid plan -> {url}                         [admin]
POST /billing/portal    open the Stripe Customer Portal (cards, invoices, cancel) -> {url}       [admin]
POST /billing/webhook   Stripe -> ERNIE. Verified by signature; the ONLY way a payment changes a plan.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.services import billing, plans
from app.services.auth import get_current_user

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan: str


def _org(db: Session, user: User) -> Organization:
    return db.query(Organization).filter(Organization.id == user.org_id).first()


@router.get("/plans")
def list_plans():
    return {"data": plans.public_plans()}


@router.get("")
def state(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = _org(db, user)
    return {"enabled": billing.enabled(), "plan": plans.plan_id(org), "status": org.subscription_status,
            "has_subscription": billing.has_live_subscription(org), "can_manage": bool(org.stripe_customer_id)}


@router.post("/checkout")
async def checkout(req: CheckoutRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not billing.enabled():
        raise HTTPException(status_code=503, detail="Online payments aren't set up yet. Contact us to change your plan.")
    if req.plan not in billing.price_ids():
        raise HTTPException(status_code=400, detail="Choose Pro or Business.")
    org = _org(db, user)
    if billing.has_live_subscription(org):
        raise HTTPException(status_code=409, detail="You already have a subscription. Use Manage billing to change it.")
    try:
        url = await asyncio.to_thread(billing.checkout_url, db, org, req.plan, user.email)
    except Exception as e:                                   # Stripe errors carry details we don't want to show customers
        print(f"[billing] checkout failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Couldn't start checkout. Please try again.")
    return {"url": url}


@router.post("/portal")
async def portal(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = _org(db, user)
    if not billing.api_ready() or not org.stripe_customer_id:   # customers must always be able to cancel
        raise HTTPException(status_code=400, detail="There's no billing account to manage yet.")
    try:
        url = await asyncio.to_thread(billing.portal_url, org)
    except Exception as e:
        print(f"[billing] portal failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Couldn't open billing. Please try again.")
    return {"url": url}


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    if not billing.webhook_enabled():
        raise HTTPException(status_code=503, detail="Webhook not configured.")
    payload = await request.body()
    try:
        event = billing.parse_event(payload, request.headers.get("stripe-signature"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid signature.")
    note = billing.apply_event(db, event)
    print(f"[billing] {event['type']} -> {note}")
    return {"received": True}

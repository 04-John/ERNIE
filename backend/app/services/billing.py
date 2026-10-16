"""
Stripe billing.

ERNIE never sees card details: checkout and card management happen on Stripe-hosted pages. The plan a
workspace is on is changed ONLY by a Stripe webhook whose signature verifies (or by a platform admin),
never by anything the browser sends. Webhook handling sets state rather than incrementing it, so
Stripe's retries and out-of-order deliveries are harmless.
"""

from typing import Optional

import stripe
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.organization import Organization
from app.services import plans

settings = get_settings()

LIVE_STATUSES = {"active", "trialing", "past_due"}          # past_due keeps access while Stripe retries the card


def price_ids() -> dict:
    return {"pro": settings.stripe_price_pro, "business": settings.stripe_price_business}


def enabled() -> bool:
    return bool(settings.stripe_secret_key) and all(price_ids().values())


def webhook_enabled() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_webhook_secret)


def plan_for_price(price_id: Optional[str]) -> Optional[str]:
    return next((p for p, pid in price_ids().items() if pid and pid == price_id), None)


def _customer_id(db: Session, org: Organization, email: str) -> str:
    if org.stripe_customer_id:
        return org.stripe_customer_id
    customer = stripe.Customer.create(email=email, name=org.name, metadata={"org_id": org.id}, api_key=settings.stripe_secret_key)
    org.stripe_customer_id = customer["id"]
    db.commit()
    return org.stripe_customer_id


def checkout_url(db: Session, org: Organization, plan: str, email: str) -> str:
    base = settings.public_app_url.rstrip("/")
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=_customer_id(db, org, email),
        client_reference_id=org.id,
        line_items=[{"price": price_ids()[plan], "quantity": 1}],
        subscription_data={"metadata": {"org_id": org.id, "plan": plan}},
        metadata={"org_id": org.id, "plan": plan},
        allow_promotion_codes=True,
        success_url=f"{base}/#/settings?billing=success",
        cancel_url=f"{base}/#/settings?billing=cancelled",
        api_key=settings.stripe_secret_key,
    )
    return session["url"]


def portal_url(org: Organization) -> str:
    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id, return_url=f"{settings.public_app_url.rstrip('/')}/#/settings", api_key=settings.stripe_secret_key)
    return session["url"]


def has_live_subscription(org: Organization) -> bool:
    return bool(org.stripe_subscription_id) and (org.subscription_status or "") in LIVE_STATUSES


def parse_event(payload: bytes, signature: Optional[str]):
    """Verify the Stripe signature and return the event. Raises ValueError if it does not verify."""
    try:
        return stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret).to_dict()
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise ValueError("invalid signature") from e


def _find_org(db: Session, obj: dict) -> Optional[Organization]:
    org_id = (obj.get("metadata") or {}).get("org_id") or obj.get("client_reference_id")
    org = db.query(Organization).filter(Organization.id == org_id).first() if org_id else None
    if org is None and obj.get("customer"):
        org = db.query(Organization).filter(Organization.stripe_customer_id == obj["customer"]).first()
    return org


def apply_event(db: Session, event) -> str:
    """Update the workspace a Stripe event is about. Returns a short note about what happened (for logs and tests)."""
    kind, obj = event["type"], event["data"]["object"]

    if kind == "checkout.session.completed":
        org = _find_org(db, obj)
        if org is None or obj.get("mode") != "subscription":
            return "ignored"
        plan = (obj.get("metadata") or {}).get("plan")
        org.stripe_customer_id = obj.get("customer") or org.stripe_customer_id
        org.stripe_subscription_id = obj.get("subscription") or org.stripe_subscription_id
        if plan in plans.PLANS and obj.get("payment_status") in ("paid", "no_payment_required"):
            org.plan, org.subscription_status = plan, "active"
        db.commit()
        return f"checkout:{org.plan}"

    if kind in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        org = _find_org(db, obj)
        if org is None:
            return "ignored"
        # a late event about an old subscription must not overwrite the current one
        if org.stripe_subscription_id and obj.get("id") != org.stripe_subscription_id and kind != "customer.subscription.created":
            return "stale"
        status = "canceled" if kind == "customer.subscription.deleted" else obj.get("status")
        price = (((obj.get("items") or {}).get("data") or [{}])[0].get("price") or {}).get("id")
        org.stripe_subscription_id = obj.get("id")
        org.subscription_status = status
        paid_plan = plan_for_price(price) or (obj.get("metadata") or {}).get("plan")
        if status in LIVE_STATUSES and paid_plan in plans.PLANS:
            org.plan = paid_plan
        elif status not in LIVE_STATUSES and status != "incomplete":
            org.plan = plans.DEFAULT_PLAN
            if status == "canceled":
                org.stripe_subscription_id = None
        db.commit()
        return f"subscription:{status}:{org.plan}"

    return "ignored"

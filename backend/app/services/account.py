"""
Data export and deletion: a customer can take their data with them and can erase it.

Export never includes secrets: no Blockradar API key, no alert targets or webhook secrets, no password
hashes. Deletion removes every row belonging to the workspace; the Stripe subscription is cancelled first
so nobody is billed for a workspace that no longer exists.
"""

from datetime import datetime
from typing import Optional

import stripe
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.state import states
from app.models.alerts import AlertChannel, AlertEvent, RiskState
from app.models.audit import AuditEvent
from app.models.auth_token import AuthToken
from app.models.insights import InsightRecord
from app.models.organization import BlockradarConnection, Invite, Organization
from app.models.stored import FintechDaily, Snapshot, StoredAddress, StoredTransaction
from app.models.usage import AiUsage
from app.models.user import User
from app.services import audit, billing, plans
from app.services.data_loader import drop_state
from app.services.sync import load_history
from app.services.tenancy import mask_wallet_id

ORG_TABLES = (StoredTransaction, StoredAddress, Snapshot, FintechDaily, InsightRecord, RiskState, AlertEvent,
              AlertChannel, BlockradarConnection, Invite, AiUsage, AuditEvent)


def _iso(dt) -> Optional[str]:
    return (dt.isoformat() + "Z") if dt else None


def export_workspace(db: Session, org: Organization) -> dict:
    conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org.id).first()
    state = states.get(org.id) or {}
    return {
        "exported_at": _iso(datetime.utcnow()),
        "workspace": {"name": org.name, "plan": plans.plan_id(org), "created_at": _iso(org.created_at), "ai_assistant_enabled": bool(org.ai_enabled)},
        "members": [{"name": u.name, "email": u.email, "role": u.role, "joined": _iso(u.created_at), "last_login": _iso(u.last_login)}
                    for u in db.query(User).filter(User.org_id == org.id).order_by(User.created_at)],
        "blockradar_connection": ({"wallet_id": mask_wallet_id(conn.wallet_id), "api_key_last4": conn.api_key_last4,
                                   "last_synced_at": _iso(conn.last_synced_at)} if conn else None),
        "alert_channels": [{"kind": c.kind, "label": c.label, "target": c.target_hint, "enabled": c.enabled, "created_at": _iso(c.created_at)}
                           for c in db.query(AlertChannel).filter(AlertChannel.org_id == org.id)],
        "fintechs": state.get("churn_scores") or [],
        "summary": state.get("summary") or {},
        "history": load_history(org.id, 800),
        "insights": [{"kind": r.kind, "severity": r.severity, "title": r.title, "detail": r.detail, "first_seen": _iso(r.first_seen),
                      "resolved_at": _iso(r.resolved_at), "dismissed_at": _iso(r.dismissed_at)}
                     for r in db.query(InsightRecord).filter(InsightRecord.org_id == org.id)],
        "alert_history": [{"kind": e.kind, "title": e.title, "detail": e.detail, "at": _iso(e.created_at)}
                          for e in db.query(AlertEvent).filter(AlertEvent.org_id == org.id).order_by(AlertEvent.created_at.desc()).limit(1000)],
        "audit_log": audit.recent(db, org.id, 1000),
        "note": "Secrets (your Blockradar API key, webhook URLs and signing secrets, password hashes) are never included in an export.",
    }


def cancel_subscription(org: Organization) -> None:
    """Stop billing. Raises if Stripe can't be reached, so a workspace is never deleted while still being charged."""
    if not org.stripe_subscription_id or not billing.enabled():
        return
    try:
        stripe.Subscription.cancel(org.stripe_subscription_id, api_key=get_settings().stripe_secret_key)
    except stripe.InvalidRequestError as e:
        if getattr(e, "code", None) != "resource_missing":      # already gone on Stripe's side is fine
            raise


def delete_workspace(db: Session, org: Organization) -> None:
    org_id = org.id
    user_ids = [u.id for u in db.query(User).filter(User.org_id == org_id)]
    for model in ORG_TABLES:
        db.query(model).filter(model.org_id == org_id).delete(synchronize_session=False)
    if user_ids:
        db.query(AuthToken).filter(AuthToken.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(User).filter(User.org_id == org_id).delete(synchronize_session=False)
    db.query(Organization).filter(Organization.id == org_id).delete(synchronize_session=False)
    db.commit()
    drop_state(org_id)


def delete_user(db: Session, user: User) -> None:
    db.query(AuthToken).filter(AuthToken.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()

"""
Audit trail: a short, append-only record of sensitive actions in a workspace.

Recording must never break the action it describes, and details must never carry secrets: callers pass
human-readable facts ("Invited a@b.com as member"), not request bodies.
"""

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent

SYSTEM = "system"


def record(db: Session, org_id: str, actor, action: str, detail: str = "") -> None:
    """`actor` is a User, or a plain label such as audit.SYSTEM / "stripe"."""
    try:
        actor_id = getattr(actor, "id", None)
        actor_email = getattr(actor, "email", None) or (actor if isinstance(actor, str) else None)
        db.add(AuditEvent(org_id=org_id, actor_id=actor_id, actor_email=actor_email, action=action, detail=(detail or "")[:300]))
        db.commit()
    except Exception as e:                                   # the audit trail must not take the real action down with it
        db.rollback()
        print(f"[audit] could not record {action}: {type(e).__name__}")


def recent(db: Session, org_id: str, limit: int = 100) -> List[dict]:
    rows = (db.query(AuditEvent).filter(AuditEvent.org_id == org_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id).limit(limit).all())
    return [{"id": r.id, "actor": r.actor_email or "unknown", "action": r.action, "detail": r.detail or "",
             "at": (r.created_at.isoformat() + "Z") if r.created_at else None} for r in rows]

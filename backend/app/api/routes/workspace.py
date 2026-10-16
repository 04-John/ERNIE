"""
Workspace Routes
================
GET    /workspace             — workspace + Blockradar connection summary
PUT    /workspace/connection  — connect (or replace) the Blockradar wallet  [admin]
DELETE /workspace/connection  — disconnect and drop cached data           [admin]

The API key is encrypted at rest and is never returned by any endpoint.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from typing import Optional
from datetime import datetime
from pydantic import EmailStr
from app.models.organization import Organization, Invite
from app.models.user import User
from app.services.auth import get_current_user, rate_limit_auth
from app.services.blockradar import Creds, CredentialError, verify_credentials
from app.services.data_loader import refresh_state, drop_state, get_status
from app.services.sync import purge_org_data
from app.services import email as mailer
from app.core.config import get_settings

settings = get_settings()
from app.services.tenancy import (
    get_connection, save_connection, delete_connection, mask_wallet_id,
    create_invite, pending_invites, VALID_ROLES, MAX_PENDING_INVITES,
)

router = APIRouter()


class ConnectRequest(BaseModel):
    api_key: str = Field(max_length=400)
    wallet_id: str = Field(max_length=64)


def _summary(db: Session, user: User) -> dict:
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    conn = get_connection(db, user.org_id)
    return {
        "workspace": {"id": org.id if org else None, "name": org.name if org else "Workspace"},
        "role": user.role,
        "connection": {
            "connected": conn is not None,
            "api_key_last4": conn.api_key_last4 if conn else None,
            "wallet_id": mask_wallet_id(conn.wallet_id) if conn else None,
            "last_synced_at": (conn.last_synced_at.isoformat() + "Z") if conn and conn.last_synced_at else None,
            "last_error": conn.last_error if conn else None,
        },
    }


@router.get("")
def get_workspace(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _summary(db, user)


@router.put("/connection", dependencies=[Depends(rate_limit_auth)])
async def connect(req: ConnectRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        creds = Creds.validate_format(req.api_key, req.wallet_id)
        await verify_credentials(creds)        # proves the key works before we store anything
    except CredentialError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    previous = get_connection(db, user.org_id)
    if previous and previous.wallet_id != creds.wallet_id:
        purge_org_data(user.org_id)            # a different wallet: never mix its history with the old one
    save_connection(db, user.org_id, creds)
    drop_state(user.org_id)                    # forget any previous wallet's data
    await refresh_state(user.org_id, creds, "connect", force=True)
    return {**_summary(db, user), "status": get_status(user.org_id)}


@router.delete("/connection")
def disconnect(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    delete_connection(db, user.org_id)
    purge_org_data(user.org_id)                # disconnecting deletes everything stored from that wallet
    drop_state(user.org_id)
    return _summary(db, user)


# ─────────────────────────────────────────────
# TEAM: members and invites
# ─────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: Optional[EmailStr] = None
    role: str = Field(default="member", max_length=16)
    send_email: bool = False          # also email the link to `email` (needs email configured)


class RoleRequest(BaseModel):
    role: str = Field(max_length=16)


def _admin_count(db: Session, org_id: str) -> int:
    return db.query(User).filter(User.org_id == org_id, User.role == "admin", User.is_active.is_(True)).count()


@router.get("/members")
def list_members(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(User).filter(User.org_id == user.org_id).order_by(User.created_at).all()
    return {"data": [
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
         "last_login": (u.last_login.isoformat() + "Z") if u.last_login else None, "is_you": u.id == user.id}
        for u in rows
    ]}


@router.patch("/members/{member_id}")
def change_role(member_id: str, req: RoleRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'.")
    target = db.query(User).filter(User.id == member_id, User.org_id == user.org_id).first()   # same workspace only
    if not target:
        raise HTTPException(status_code=404, detail="Member not found.")
    if target.role == "admin" and req.role != "admin" and _admin_count(db, user.org_id) <= 1:
        raise HTTPException(status_code=400, detail="A workspace needs at least one admin.")
    target.role = req.role
    db.commit()
    return {"id": target.id, "role": target.role}


@router.delete("/members/{member_id}")
def remove_member(member_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if member_id == user.id:
        raise HTTPException(status_code=400, detail="You can't remove yourself.")
    target = db.query(User).filter(User.id == member_id, User.org_id == user.org_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found.")
    if target.role == "admin" and _admin_count(db, user.org_id) <= 1:
        raise HTTPException(status_code=400, detail="A workspace needs at least one admin.")
    db.delete(target)
    db.commit()
    return {"removed": True}


@router.get("/invites")
def list_invites(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"data": [
        {"id": i.id, "email": i.email, "role": i.role,
         "created_at": (i.created_at.isoformat() + "Z") if i.created_at else None,
         "expires_at": i.expires_at.isoformat() + "Z"}
        for i in pending_invites(db, user.org_id)
    ]}


@router.post("/invites", dependencies=[Depends(rate_limit_auth)])
def new_invite(req: InviteRequest, background: BackgroundTasks, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'.")
    if len(pending_invites(db, user.org_id)) >= MAX_PENDING_INVITES:
        raise HTTPException(status_code=400, detail="Too many pending invitations. Revoke some first.")
    if req.email and db.query(User).filter(User.email == req.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="That email already has an ERNIE account.")
    invite, token = create_invite(db, user.org_id, user.id, req.email, req.role)
    emailed = False
    if req.send_email and invite.email and mailer.email_enabled():
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        subject, text, html = mailer.invite_email(
            f"{settings.app_base_url}/?invite={token}", org.name if org else "a workspace", user.name or user.email, invite.role)
        background.add_task(mailer.send_email, invite.email, subject, text, html)
        emailed = True
    # the token is returned ONCE, here; only its hash is stored
    return {"id": invite.id, "token": token, "email": invite.email, "role": invite.role,
            "expires_at": invite.expires_at.isoformat() + "Z", "emailed": emailed}


@router.delete("/invites/{invite_id}")
def revoke_invite(invite_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    inv = db.query(Invite).filter(Invite.id == invite_id, Invite.org_id == user.org_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    inv.revoked_at = datetime.utcnow()
    db.commit()
    return {"revoked": True}

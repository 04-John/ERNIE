"""
Account Routes: audit log, data export, deletion
================================================
GET    /workspace/audit    who did what in this workspace                         [admin]
GET    /workspace/export   everything we hold about the workspace, as JSON         [admin]
DELETE /workspace          erase the workspace and all its data                    [admin]
DELETE /account            erase your own account (and the workspace if you are its only member)

Deletion is permanent, so it asks for the workspace name (or your email) and, if you have one, your password.
"""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.services import account, audit
from app.services.auth import get_current_user, rate_limit_auth, verify_password

router = APIRouter()


class DeleteWorkspaceRequest(BaseModel):
    confirm_name: str = Field(max_length=200)
    password: Optional[str] = Field(default=None, max_length=200)


class DeleteAccountRequest(BaseModel):
    confirm_email: str = Field(max_length=320)
    password: Optional[str] = Field(default=None, max_length=200)


def _check_password(user: User, password: Optional[str]) -> None:
    if user.hashed_password and not (password and verify_password(password, user.hashed_password)):
        raise HTTPException(status_code=400, detail="Your password is incorrect.")


async def _cancel_billing(org: Organization) -> None:
    try:
        await asyncio.to_thread(account.cancel_subscription, org)
    except Exception as e:
        print(f"[account] could not cancel subscription: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="We couldn't cancel your subscription, so nothing was deleted. Please try again.")


@router.get("/audit")
def audit_log(limit: int = Query(default=100, ge=1, le=500), user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"data": audit.recent(db, user.org_id, limit)}


@router.get("/export")
def export(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    data = account.export_workspace(db, org)
    audit.record(db, org.id, user, "workspace.exported", "Downloaded a copy of the workspace data")
    return Response(json.dumps(data, indent=2, default=str), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="ernie-export.json"', "Cache-Control": "no-store"})


@router.delete("", dependencies=[Depends(rate_limit_auth)])
async def delete_workspace(req: DeleteWorkspaceRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if req.confirm_name.strip() != (org.name or "").strip():
        raise HTTPException(status_code=400, detail="Type the workspace name exactly to confirm.")
    _check_password(user, req.password)
    await _cancel_billing(org)
    print(f"[account] workspace {org.id} deleted by {user.id}")
    await asyncio.to_thread(account.delete_workspace, db, org)
    return {"deleted": True}


account_router = APIRouter()


@account_router.delete("", dependencies=[Depends(rate_limit_auth)])
async def delete_account(req: DeleteAccountRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.confirm_email.strip().lower() != user.email.lower():
        raise HTTPException(status_code=400, detail="Type your email address exactly to confirm.")
    _check_password(user, req.password)
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    others = db.query(User).filter(User.org_id == user.org_id, User.id != user.id).all() if org else []
    if org and not others:
        await _cancel_billing(org)                        # the only member: the workspace goes with them
        await asyncio.to_thread(account.delete_workspace, db, org)
        return {"deleted": True, "workspace_deleted": True}
    if user.role == "admin" and not any(o.role == "admin" for o in others):
        raise HTTPException(status_code=400, detail="You're the only admin. Make someone else an admin first, or delete the workspace.")
    if org:
        audit.record(db, org.id, user, "member.left", f"{user.email} deleted their account")
    await asyncio.to_thread(account.delete_user, db, user)
    return {"deleted": True, "workspace_deleted": False}

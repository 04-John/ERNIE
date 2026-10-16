"""
Workspace Routes
================
GET    /workspace             — workspace + Blockradar connection summary
PUT    /workspace/connection  — connect (or replace) the Blockradar wallet  [admin]
DELETE /workspace/connection  — disconnect and drop cached data           [admin]

The API key is encrypted at rest and is never returned by any endpoint.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import get_current_user, rate_limit_auth
from app.services.blockradar import Creds, CredentialError, verify_credentials
from app.services.data_loader import refresh_state, drop_state, get_status
from app.services.tenancy import get_connection, save_connection, delete_connection, mask_wallet_id

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

    save_connection(db, user.org_id, creds)
    drop_state(user.org_id)                    # forget any previous wallet's data
    await refresh_state(user.org_id, creds, "connect", force=True)
    return {**_summary(db, user), "status": get_status(user.org_id)}


@router.delete("/connection")
def disconnect(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    delete_connection(db, user.org_id)
    drop_state(user.org_id)
    return _summary(db, user)

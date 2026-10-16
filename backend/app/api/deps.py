"""
Request-scoped tenancy helpers.

`org_ctx` resolves which dataset the caller may see: their own workspace's data if
they have connected Blockradar, otherwise the shared read-only demo dataset.
Routes must read data only through `ctx.state`, never from global state.
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.state import DEMO_KEY, states, empty_state
from app.models.user import User
from app.services.auth import get_current_user
from app.services.blockradar import Creds
from app.services.data_loader import ensure_loaded
from app.services.tenancy import get_connection, creds_from_connection

settings = get_settings()


@dataclass
class OrgCtx:
    key: str                 # state key: org id, or DEMO_KEY
    state: dict              # this workspace's results
    creds: Optional[Creds]
    connected: bool
    org_id: str
    role: str


async def org_ctx(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> OrgCtx:
    org_id = user.org_id or ""
    key, creds, connected = DEMO_KEY, None, False

    if settings.data_mode != "simulated":
        conn = get_connection(db, org_id)
        if conn:
            connected = True
            key = org_id
            try:
                creds = creds_from_connection(conn)
            except ValueError:
                # encryption key changed: surface it, don't crash or leak demo data as real
                st = states.setdefault(org_id, empty_state())
                st.update(data_source="error", last_error="Saved Blockradar credentials can't be read. Reconnect in Settings.")
                return OrgCtx(key=key, state=st, creds=None, connected=True, org_id=org_id, role=user.role)

    state = await ensure_loaded(key, creds)
    return OrgCtx(key=key, state=state, creds=creds, connected=connected, org_id=org_id, role=user.role)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only workspace admins can do this.")
    return user

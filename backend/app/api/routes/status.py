"""
Public status: GET /status

Tells anyone (customers, uptime monitors) whether ERNIE is working, without exposing anything about
any workspace. Returns 200 either way; read the `status` field. /health stays as the cheap liveness probe.
"""

import time
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.core import scheduler
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services import assistant, billing, email as mailer

router = APIRouter()
settings = get_settings()


def _database() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _sync_ok() -> bool:
    """The background sync loop has run recently (or is not due yet)."""
    interval = max(settings.pipeline_schedule_hours, 0.05) * 3600
    last = scheduler.progress["last_run"] or scheduler.progress["started"]
    return time.time() - last < 2 * interval + 900 and scheduler.progress["last_error"] is None


@router.get("/status")
def status():
    db_ok, sync_ok = _database(), _sync_ok()
    components = [
        {"name": "Web application and API", "ok": True},
        {"name": "Database", "ok": db_ok},
        {"name": "Scheduled data refresh", "ok": sync_ok},
    ]
    optional = [("Ask ERNIE assistant", assistant.available()), ("Email delivery", mailer.email_enabled()), ("Online payments", billing.enabled())]
    return {
        "status": "operational" if db_ok and sync_ok else "degraded",
        "components": components,
        "optional": [{"name": n, "configured": c} for n, c in optional],
        "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

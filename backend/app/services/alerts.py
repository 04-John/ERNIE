"""
Alerts
======
Turns each sync's results into notifications.

  process_results()   compare against the last known risk tiers, persist events, update state
  dispatch()          deliver new events to the workspace's channels (email / Slack / signed webhook)

Design rules:
  * The first sync only records a baseline. Nothing alerts until there is something to compare against.
  * One message per channel per sync (a digest), never one per fintech.
  * A fintech that flaps in and out of High is alerted at most once per 24h.
  * Delivery problems are recorded on the channel and never affect syncing.
  * Webhook/Slack URLs are re-validated for SSRF on every send; redirects are never followed.
"""

import asyncio
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import httpx

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.alerts import RiskState, AlertEvent, AlertChannel
from app.models.organization import Organization
from app.models.user import User
from app.services import crypto, email as mailer, netsafe

settings = get_settings()

THROTTLE = timedelta(hours=24)
SYNC_FAILURE_THROTTLE_S = 6 * 3600
MAX_CHANNELS = 10
MAX_LISTED = 10
KINDS = ("email", "slack", "webhook")

_last_sync_alert: Dict[str, float] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─────────────────────────────────────────────
# DETECTION (pure)
# ─────────────────────────────────────────────

def detect_events(current: List[dict], prev: Dict[str, dict], now: datetime) -> List[dict]:
    """
    current: churn score rows. prev: {fintech_id: {"risk", "last_alert_at"}} from the previous sync.
    An empty `prev` is the baseline sync, so no events.
    """
    if not prev:
        return []
    events = []
    for row in current:
        fid, risk = row["fintech_id"], row.get("churn_risk", "Unknown")
        old = prev.get(fid)
        old_risk = old["risk"] if old else "Unknown"
        name = row.get("fintech_name") or "A fintech"
        prob = float(row.get("churn_probability") or 0.0)
        if risk == "High" and old_risk != "High":
            last = old["last_alert_at"] if old else None
            if last and now - last < THROTTLE:
                continue                                            # flapping: don't repeat within 24h
            events.append({"kind": "high_risk", "fintech_id": fid, "fintech_name": name, "risk": risk, "probability": prob,
                           "title": f"{name} is now at high churn risk", "detail": f"Churn probability {prob:.0%}."})
        elif risk != "High" and old_risk == "High":
            events.append({"kind": "recovered", "fintech_id": fid, "fintech_name": name, "risk": risk, "probability": prob,
                           "title": f"{name} is no longer high risk", "detail": f"Now {risk.lower()} risk."})
    return events


def process_results(org_id: str, results: dict) -> List[dict]:
    """Persist events and the new risk snapshot. Returns the new events (to be delivered)."""
    scores = results.get("churn_scores") or []
    now = _now()
    with SessionLocal() as db:
        rows = {r.fintech_id: r for r in db.query(RiskState).filter(RiskState.org_id == org_id).all()}
        prev = {fid: {"risk": r.risk, "last_alert_at": r.last_alert_at} for fid, r in rows.items()}
        events = detect_events(scores, prev, now)
        alerted = {e["fintech_id"] for e in events if e["kind"] == "high_risk"}

        seen = set()
        for s in scores:
            fid = s["fintech_id"]
            seen.add(fid)
            row = rows.get(fid)
            if row is None:
                row = RiskState(org_id=org_id, fintech_id=fid)
                db.add(row)
            row.fintech_name = s.get("fintech_name") or ""
            row.risk = s.get("churn_risk", "Unknown")
            row.probability = float(s.get("churn_probability") or 0.0)
            row.updated_at = now
            if fid in alerted:
                row.last_alert_at = now
        for fid, row in rows.items():
            if fid not in seen:
                db.delete(row)
        for e in events:
            db.add(AlertEvent(org_id=org_id, kind=e["kind"], fintech_id=e["fintech_id"], fintech_name=e["fintech_name"],
                              title=e["title"], detail=e["detail"]))
        db.commit()
    return events


def record_sync_failure(org_id: str, error: str) -> Optional[dict]:
    """A 'sync failed' event, at most once per 6 hours per workspace."""
    if time.monotonic() - _last_sync_alert.get(org_id, -1e9) < SYNC_FAILURE_THROTTLE_S:
        return None
    _last_sync_alert[org_id] = time.monotonic()
    ev = {"kind": "sync_failed", "fintech_id": None, "fintech_name": None,
          "title": "Blockradar sync failed", "detail": "ERNIE couldn't reach your wallet and is showing the last good data.",
          "risk": None, "probability": None}
    with SessionLocal() as db:
        db.add(AlertEvent(org_id=org_id, kind=ev["kind"], title=ev["title"], detail=ev["detail"]))
        db.commit()
    return ev


def recent_events(org_id: str, limit: int = 30) -> List[dict]:
    with SessionLocal() as db:
        rows = db.query(AlertEvent).filter(AlertEvent.org_id == org_id).order_by(AlertEvent.created_at.desc()).limit(limit).all()
        return [{"id": r.id, "kind": r.kind, "fintech_id": r.fintech_id, "fintech_name": r.fintech_name, "title": r.title,
                 "detail": r.detail, "created_at": (r.created_at.isoformat() + "Z") if r.created_at else None} for r in rows]


# ─────────────────────────────────────────────
# MESSAGES
# ─────────────────────────────────────────────

def _lines(events: List[dict]) -> List[str]:
    out = [f"• {e['title']}" + (f" ({e['detail']})" if e.get("detail") and e["kind"] != "sync_failed" else "") for e in events[:MAX_LISTED]]
    if len(events) > MAX_LISTED:
        out.append(f"…and {len(events) - MAX_LISTED} more")
    return out


def format_text(workspace: str, events: List[dict]) -> str:
    return f"ERNIE alert for {workspace}\n" + "\n".join(_lines(events)) + f"\n\nOpen ERNIE: {settings.app_base_url}/#/analytics"


def webhook_payload(workspace: str, events: List[dict], test: bool = False) -> dict:
    return {
        "type": "ernie.test" if test else "ernie.alerts",
        "workspace": workspace,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "events": [{k: e.get(k) for k in ("kind", "fintech_id", "fintech_name", "risk", "probability", "title", "detail")} for e in events],
    }


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ─────────────────────────────────────────────
# DELIVERY
# ─────────────────────────────────────────────

async def _post(url: str, body: bytes, headers: dict) -> None:
    """The single outbound HTTP call. Validated right before sending; redirects are refused."""
    await netsafe.assert_public(url)
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        r = await client.post(url, content=body, headers={"Content-Type": "application/json", **headers})
    if r.status_code >= 300:
        raise RuntimeError(f"The endpoint answered with HTTP {r.status_code}")


def _load_channels(org_id: str, only_id: Optional[str] = None, include_disabled: bool = False) -> List[dict]:
    with SessionLocal() as db:
        q = db.query(AlertChannel).filter(AlertChannel.org_id == org_id)
        if only_id:
            q = q.filter(AlertChannel.id == only_id)
        if not include_disabled:
            q = q.filter(AlertChannel.enabled.is_(True))
        org = db.query(Organization).filter(Organization.id == org_id).first()
        out = []
        for c in q.all():
            try:
                out.append({"id": c.id, "kind": c.kind, "label": c.label, "target": crypto.decrypt(c.target_enc),
                            "secret": crypto.decrypt(c.secret_enc) if c.secret_enc else None,
                            "workspace": org.name if org else "your workspace"})
            except ValueError:
                _record(c.id, "Stored credentials can't be read. Re-create this channel.")
        return out


def _is_member(org_id: str, email: str) -> bool:
    with SessionLocal() as db:
        return db.query(User.id).filter(User.org_id == org_id, User.email == email.lower(), User.is_active.is_(True)).first() is not None


def _record(channel_id: str, error: Optional[str]) -> None:
    with SessionLocal() as db:
        c = db.query(AlertChannel).filter(AlertChannel.id == channel_id).first()
        if c:
            c.last_error = error
            if error is None:
                c.last_sent_at = _now()
            db.commit()


async def _deliver(ch: dict, org_id: str, events: List[dict], test: bool = False) -> None:
    workspace = ch["workspace"]
    if ch["kind"] == "email":
        if not mailer.email_enabled():
            raise RuntimeError("Email isn't configured on this server.")
        if not await asyncio.to_thread(_is_member, org_id, ch["target"]):
            raise RuntimeError("That address is no longer a member of this workspace.")
        subject, text, html = mailer.alert_email(workspace, _lines(events), f"{settings.app_base_url}/#/analytics", test)
        if not await mailer.send_email(ch["target"], subject, text, html):
            raise RuntimeError("The email could not be delivered.")
    elif ch["kind"] == "slack":
        body = json.dumps({"text": ("Test message from ERNIE. Your Slack alerts are connected." if test else format_text(workspace, events))}).encode()
        await _post(ch["target"], body, {})
    elif ch["kind"] == "webhook":
        body = json.dumps(webhook_payload(workspace, events, test), separators=(",", ":")).encode()
        await _post(ch["target"], body, {"X-ERNIE-Event": "test" if test else "alerts", "X-ERNIE-Signature": sign(ch["secret"] or "", body)})


async def dispatch(org_id: str, events: List[dict]) -> None:
    """Deliver one digest per channel. Never raises."""
    if not events:
        return
    try:
        channels = await asyncio.to_thread(_load_channels, org_id)
    except Exception as e:
        print(f"[alerts] could not load channels: {type(e).__name__}")
        return
    for ch in channels:
        try:
            await _deliver(ch, org_id, events)
            await asyncio.to_thread(_record, ch["id"], None)
        except Exception as e:
            msg = (str(e) if isinstance(e, (RuntimeError, netsafe.UnsafeURL)) else f"{type(e).__name__} while sending")[:300]
            print(f"[alerts] delivery to a {ch['kind']} channel failed: {msg}")
            await asyncio.to_thread(_record, ch["id"], msg)


async def send_test(org_id: str, channel_id: str) -> Optional[str]:
    """Send a test message. Returns None on success, or a user-safe error string."""
    found = await asyncio.to_thread(_load_channels, org_id, channel_id, True)
    if not found:
        return "Channel not found."
    ch = found[0]
    try:
        await _deliver(ch, org_id, [{"kind": "test", "title": "This is a test alert from ERNIE", "detail": None}], test=True)
        await asyncio.to_thread(_record, ch["id"], None)
        return None
    except Exception as e:
        msg = (str(e) if isinstance(e, (RuntimeError, netsafe.UnsafeURL)) else f"{type(e).__name__} while sending")[:300]
        await asyncio.to_thread(_record, ch["id"], msg)
        return msg


# ─────────────────────────────────────────────
# CHANNEL CREATION
# ─────────────────────────────────────────────

class ChannelError(ValueError):
    """User-safe validation message."""


async def build_channel(org_id: str, kind: str, target: str, label: str) -> dict:
    """Validate and prepare a new channel. Returns kwargs for AlertChannel plus the one-time webhook secret."""
    kind = (kind or "").lower()
    target = (target or "").strip()
    if kind not in KINDS:
        raise ChannelError("Channel type must be email, slack or webhook.")
    secret_plain = None
    if kind == "email":
        if not await asyncio.to_thread(_is_member, org_id, target):
            raise ChannelError("Alert emails can only go to members of this workspace.")
        hint = target.lower()
        target = target.lower()
    else:
        try:
            parts = await netsafe.assert_public(target)
        except netsafe.UnsafeURL as e:
            raise ChannelError(str(e))
        if kind == "slack" and parts.hostname != "hooks.slack.com":
            raise ChannelError("Slack webhooks must be a hooks.slack.com URL.")
        hint = f"{parts.hostname}/…{target[-4:]}"
        if kind == "webhook":
            secret_plain = secrets.token_urlsafe(32)
    return {
        "kind": kind, "label": (label or kind.title())[:60], "target_enc": crypto.encrypt(target), "target_hint": hint,
        "secret_enc": crypto.encrypt(secret_plain) if secret_plain else None, "_secret_plain": secret_plain,
    }

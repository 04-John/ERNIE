import asyncio
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import pytest

from conftest import register, make_dataset, KEY_A, WALLET_A
from app.core.database import SessionLocal
from app.models.alerts import AlertChannel, AlertEvent
from app.models.user import User
from app.services import alerts, netsafe, auth as auth_service

NOW = datetime(2026, 10, 16, 12, 0, 0)


def row(fid, risk, name=None, prob=0.5):
    return {"fintech_id": fid, "fintech_name": name or f"F-{fid}", "churn_risk": risk, "churn_probability": prob}


def prev(**kw):
    return {fid: {"risk": r, "last_alert_at": None} for fid, r in kw.items()}


# ───────────────────────── detection (pure) ─────────────────────────

def test_first_sync_is_only_a_baseline():
    assert alerts.detect_events([row("a", "High"), row("b", "Low")], {}, NOW) == []


def test_transitions_into_and_out_of_high_risk():
    current = [row("a", "High", "Alpha"), row("b", "Low", "Beta"), row("c", "Medium", "Gamma"), row("d", "Low")]
    ev = alerts.detect_events(current, prev(a="Low", b="High", c="Medium", d="Low"), NOW)
    assert [(e["kind"], e["fintech_name"]) for e in ev] == [("high_risk", "Alpha"), ("recovered", "Beta")]


def test_unknown_to_high_and_brand_new_high_fintech_both_alert():
    ev = alerts.detect_events([row("a", "High"), row("new", "High")], prev(a="Unknown", other="Low"), NOW)
    assert {e["fintech_id"] for e in ev} == {"a", "new"}


def test_a_flapping_fintech_is_throttled_for_24_hours():
    recent = {"a": {"risk": "Low", "last_alert_at": NOW - timedelta(hours=3)}}
    assert alerts.detect_events([row("a", "High")], recent, NOW) == []
    old = {"a": {"risk": "Low", "last_alert_at": NOW - timedelta(hours=25)}}
    assert len(alerts.detect_events([row("a", "High")], old, NOW)) == 1


# ───────────────────────── SSRF protection ─────────────────────────

@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["93.184.216.34"])


@pytest.mark.parametrize("url", [
    "http://example.com/hook",                       # not https
    "https://localhost/hook", "https://127.0.0.1/hook", "https://[::1]/hook",
    "https://10.0.0.5/hook", "https://192.168.1.10/hook", "https://172.16.0.1/hook",
    "https://169.254.169.254/latest/meta-data",      # cloud metadata
    "https://user:pass@example.com/hook",            # embedded credentials
    "https://example.com:8443/hook",                 # non-standard port
    "https://db.internal/hook", "https://printer.local/hook",
    "ftp://example.com/hook", "javascript:alert(1)", "https://",
])
def test_unsafe_urls_are_rejected(url):
    with pytest.raises(netsafe.UnsafeURL):
        asyncio.run(netsafe.assert_public(url))


def test_a_public_https_url_is_accepted():
    asyncio.run(netsafe.assert_public("https://hooks.example.com/ernie"))


def test_a_hostname_that_resolves_to_a_private_address_is_rejected(monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["93.184.216.34", "10.0.0.7"])      # DNS-rebinding style
    with pytest.raises(netsafe.UnsafeURL):
        asyncio.run(netsafe.assert_public("https://evil.example.com/hook"))


def test_the_send_path_rechecks_the_url_so_a_later_dns_change_cannot_bypass_it(monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["127.0.0.1"])                      # DNS changed after the channel was saved
    with pytest.raises(netsafe.UnsafeURL):
        asyncio.run(alerts._post("https://was-fine-yesterday.example.com/hook", b"{}", {}))


# ───────────────────────── fixtures & helpers ─────────────────────────

class Outbox(list):
    """Captures outgoing webhook/Slack calls. Set `.boom` to a message to make delivery fail."""
    boom = None


@pytest.fixture()
def outbox(monkeypatch):
    sent = Outbox()

    async def capture(url, body, headers):
        if sent.boom:
            raise RuntimeError(sent.boom)
        sent.append({"url": url, "body": body, "headers": headers})

    monkeypatch.setattr(alerts, "_post", capture)
    return sent


def wait_for(pred, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.05)
    return False


def settle(seconds=0.4):
    time.sleep(seconds)                               # long enough for any (unexpected) background delivery to land


def iso_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")


def connect(client, h):
    r = client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    assert r.status_code == 200, r.text


def add(client, h, kind, target, label=""):
    return client.post("/workspace/alerts/channels", headers=h, json={"kind": kind, "target": target, "label": label})


def refresh(client, h):
    assert client.post("/analytics/refresh", headers=h).status_code == 200


WEBHOOK = "https://hooks.example.com/ernie/abcdef1234"
SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXX"


# ───────────────────────── channel management ─────────────────────────

def test_webhook_secret_is_shown_once_and_targets_are_encrypted(client, outbox):
    h = register(client)
    r = add(client, h, "webhook", WEBHOOK, "Ops")
    assert r.status_code == 200 and len(r.json()["secret"]) >= 32
    listing = client.get("/workspace/alerts/channels", headers=h)
    assert "secret" not in listing.text and WEBHOOK not in listing.text
    assert listing.json()["data"][0]["hint"].startswith("hooks.example.com/")
    with SessionLocal() as db:
        c = db.query(AlertChannel).one_or_none() if db.query(AlertChannel).count() == 1 else db.query(AlertChannel).order_by(AlertChannel.created_at.desc()).first()
        assert WEBHOOK not in c.target_enc and r.json()["secret"] not in (c.secret_enc or "")


def test_slack_channels_must_be_slack_urls(client, outbox):
    h = register(client)
    assert add(client, h, "slack", "https://hooks.example.com/x").status_code == 400
    assert add(client, h, "slack", "https://hooks.slack.com.evil.com/services/x").status_code == 400
    assert add(client, h, "slack", SLACK).status_code == 200


def test_unsafe_webhook_urls_are_refused_at_creation(client, outbox):
    h = register(client)
    for bad in ["http://example.com/x", "https://127.0.0.1/x", "https://169.254.169.254/x", "https://localhost/x"]:
        assert add(client, h, "webhook", bad).status_code == 400


def test_email_channels_only_go_to_workspace_members(client, outbox):
    h = register(client)
    me = client.get("/auth/me", headers=h).json()["email"]
    assert add(client, h, "email", "stranger@example.com").status_code == 400
    assert add(client, h, "email", me).status_code == 200


def test_only_admins_manage_channels_but_members_can_read_events(client, outbox):
    admin = register(client)
    tok = client.post("/workspace/invites", headers=admin, json={"role": "member"}).json()["token"]
    j = client.post("/auth/register", json={"email": "alerts-member@example.com", "password": "password123", "name": "T", "invite_token": tok})
    member = {"Authorization": f"Bearer {j.json()['access_token']}"}
    ch = add(client, admin, "webhook", WEBHOOK).json()

    assert client.get("/workspace/alerts/channels", headers=member).status_code == 403
    assert add(client, member, "webhook", WEBHOOK).status_code == 403
    assert client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=member).status_code == 403
    assert client.patch(f"/workspace/alerts/channels/{ch['id']}", headers=member, json={"enabled": False}).status_code == 403
    assert client.delete(f"/workspace/alerts/channels/{ch['id']}", headers=member).status_code == 403
    assert client.get("/workspace/alerts/events", headers=member).status_code == 200


def test_channels_are_private_to_their_workspace(client, outbox):
    a, b = register(client, "A"), register(client, "B")
    ch = add(client, a, "webhook", WEBHOOK).json()
    assert client.get("/workspace/alerts/channels", headers=b).json()["data"] == []
    assert client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=b).status_code == 404
    assert client.patch(f"/workspace/alerts/channels/{ch['id']}", headers=b, json={"enabled": False}).status_code == 404
    assert client.delete(f"/workspace/alerts/channels/{ch['id']}", headers=b).status_code == 404
    assert len(client.get("/workspace/alerts/channels", headers=a).json()["data"]) == 1


def test_channel_limit(client, outbox):
    h = register(client)
    for i in range(alerts.MAX_CHANNELS):
        assert add(client, h, "webhook", f"https://hooks.example.com/{i}").status_code == 200
        auth_service._attempts.clear()          # this test adds many channels; don't trip the per-IP limiter
    assert add(client, h, "webhook", "https://hooks.example.com/overflow").status_code == 400


# ───────────────────────── delivery ─────────────────────────

def make_fintech_dormant(fake, index=1, days=200):
    fake.datasets[KEY_A]["txs"][index]["createdAt"] = iso_days_ago(days)


def make_fintech_active(fake, index=1):
    fake.datasets[KEY_A]["txs"][index]["createdAt"] = iso_days_ago(0.001)


def test_alert_lifecycle_baseline_then_high_risk_then_no_repeat_then_recovery(client, fake, outbox):
    h = register(client)
    wh = add(client, h, "webhook", WEBHOOK, "Ops").json()
    add(client, h, "slack", SLACK)
    connect(client, h)                                   # first sync = baseline
    settle()
    assert outbox == [] and client.get("/workspace/alerts/events", headers=h).json()["data"] == []

    make_fintech_dormant(fake)
    refresh(client, h)
    assert wait_for(lambda: len(outbox) == 2)            # one digest per channel
    by_url = {m["url"]: m for m in outbox}
    hook = by_url[WEBHOOK]

    # webhook: signed JSON a receiver can verify with the secret it was given once
    expected = "sha256=" + hmac.new(wh["secret"].encode(), hook["body"], hashlib.sha256).hexdigest()
    assert hook["headers"]["X-ERNIE-Signature"] == expected and hook["headers"]["X-ERNIE-Event"] == "alerts"
    payload = json.loads(hook["body"])
    assert payload["type"] == "ernie.alerts"
    assert [(e["kind"], e["fintech_name"]) for e in payload["events"]] == [("high_risk", "A Fintech 1")]
    assert "A Fintech 1" in json.loads(by_url[SLACK]["body"])["text"]

    ev = client.get("/workspace/alerts/events", headers=h).json()["data"]
    assert [e["kind"] for e in ev] == ["high_risk"] and ev[0]["fintech_name"] == "A Fintech 1"

    outbox.clear()
    refresh(client, h)                                   # nothing changed: no repeat
    settle()
    assert outbox == []

    make_fintech_active(fake)
    refresh(client, h)
    assert wait_for(lambda: len(outbox) == 2)
    assert json.loads([m for m in outbox if m["url"] == WEBHOOK][0]["body"])["events"][0]["kind"] == "recovered"


def test_disabled_channels_receive_nothing(client, fake, outbox):
    h = register(client)
    ch = add(client, h, "webhook", WEBHOOK).json()
    connect(client, h)
    client.patch(f"/workspace/alerts/channels/{ch['id']}", headers=h, json={"enabled": False})
    make_fintech_dormant(fake)
    refresh(client, h)
    settle()
    assert outbox == []
    assert len(client.get("/workspace/alerts/events", headers=h).json()["data"]) == 1      # still recorded in history


def test_a_failing_channel_is_reported_and_never_breaks_syncing(client, fake, outbox):
    h = register(client)
    ch = add(client, h, "webhook", WEBHOOK).json()
    connect(client, h)
    outbox.boom = "The endpoint answered with HTTP 500"
    make_fintech_dormant(fake)
    refresh(client, h)                                   # must still succeed
    assert wait_for(lambda: "HTTP 500" in (client.get("/workspace/alerts/channels", headers=h).json()["data"][0]["last_error"] or ""))
    assert client.get("/analytics/summary", headers=h).json()["data"]["total_wallets"] == 3

    outbox.boom = None
    r = client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=h)
    assert r.json() == {"ok": True, "error": None}
    assert client.get("/workspace/alerts/channels", headers=h).json()["data"][0]["last_error"] is None


def test_the_test_button_reports_failures(client, outbox):
    h = register(client)
    ch = add(client, h, "webhook", WEBHOOK).json()
    outbox.boom = "The endpoint answered with HTTP 404"
    r = client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=h).json()
    assert r["ok"] is False and "404" in r["error"]


def test_test_messages_are_signed_and_labelled(client, outbox):
    h = register(client)
    ch = add(client, h, "webhook", WEBHOOK).json()
    assert client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=h).json()["ok"] is True
    msg = outbox[-1]
    assert json.loads(msg["body"])["type"] == "ernie.test" and msg["headers"]["X-ERNIE-Event"] == "test"
    assert msg["headers"]["X-ERNIE-Signature"].startswith("sha256=")


def test_sync_failure_alert_fires_once_not_every_time(client, fake, outbox):
    alerts._last_sync_alert.clear()
    h = register(client)
    add(client, h, "webhook", WEBHOOK)
    connect(client, h)
    fake.fail = True
    refresh(client, h)
    assert wait_for(lambda: len(outbox) == 1)
    assert json.loads(outbox[0]["body"])["events"][0]["kind"] == "sync_failed"
    refresh(client, h)
    settle()
    assert len(outbox) == 1                              # throttled


def test_email_channel_delivers_to_a_member(client, fake, outbox, mailbox):
    h = register(client)
    me = client.get("/auth/me", headers=h).json()["email"]
    add(client, h, "email", me)
    connect(client, h)
    mailbox.clear()
    make_fintech_dormant(fake)
    refresh(client, h)
    assert wait_for(lambda: len(mailbox) == 1)
    assert mailbox[0]["to"] == me and "A Fintech 1" in mailbox[0]["text"] and "alert" in mailbox[0]["subject"].lower()


def test_email_alerts_stop_when_the_recipient_is_removed_from_the_workspace(client, outbox, mailbox):
    admin = register(client)
    tok = client.post("/workspace/invites", headers=admin, json={"role": "member"}).json()["token"]
    client.post("/auth/register", json={"email": "leaver@example.com", "password": "password123", "name": "L", "invite_token": tok})
    assert add(client, admin, "email", "leaver@example.com").status_code == 200
    members = client.get("/workspace/members", headers=admin).json()["data"]
    leaver = next(m for m in members if m["email"] == "leaver@example.com")
    client.delete(f"/workspace/members/{leaver['id']}", headers=admin)

    org = client.get("/workspace", headers=admin).json()["workspace"]["id"]
    mailbox.clear()
    asyncio.run(alerts.dispatch(org, [{"kind": "high_risk", "title": "X is now at high churn risk", "detail": None}]))
    assert mailbox == []                                  # nothing was sent to the ex-member
    err = client.get("/workspace/alerts/channels", headers=admin).json()["data"][0]["last_error"]
    assert "no longer a member" in err


def test_email_channel_reports_when_email_is_not_configured(client, outbox, mailbox):
    h = register(client)
    me = client.get("/auth/me", headers=h).json()["email"]
    ch = add(client, h, "email", me).json()
    mailbox.enabled = False
    r = client.post(f"/workspace/alerts/channels/{ch['id']}/test", headers=h).json()
    assert r["ok"] is False and "isn't configured" in r["error"]


def test_events_are_scoped_to_their_workspace(client, fake, outbox):
    a, b = register(client, "A"), register(client, "B")
    connect(client, a)
    make_fintech_dormant(fake)
    refresh(client, a)
    assert wait_for(lambda: len(client.get("/workspace/alerts/events", headers=a).json()["data"]) == 1)
    assert client.get("/workspace/alerts/events", headers=b).json()["data"] == []

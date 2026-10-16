import pytest

from conftest import register, set_plan, KEY_A, WALLET_A
from app.api.routes import admin as admin_routes
from app.core import scheduler
from app.core.database import SessionLocal
from app.models.user import User


def email_of(client, h):
    return client.get("/auth/me", headers=h).json()["email"]


def verify(email):
    with SessionLocal() as db:
        db.query(User).filter(User.email == email).update({"is_verified": True})
        db.commit()


@pytest.fixture()
def boss(client, monkeypatch):
    """A verified platform admin."""
    h = register(client, "Boss")
    email = email_of(client, h)
    monkeypatch.setattr(admin_routes.settings, "platform_admin_emails", f"  {email.upper()} , other@example.com")
    verify(email)
    return h


def test_the_console_does_not_exist_for_everyone_else(client, boss):
    ordinary = register(client)
    for method, url in (("GET", "/admin/overview"), ("GET", "/admin/workspaces"), ("PATCH", "/admin/workspaces/x/plan")):
        assert client.request(method, url, headers=ordinary, json={"plan": "pro"}).status_code == 404
        assert client.request(method, url, json={"plan": "pro"}).status_code in (401, 403)
    assert client.get("/auth/me", headers=ordinary).json()["platform_admin"] is False


def test_a_workspace_admin_is_not_a_platform_admin(client, monkeypatch):
    monkeypatch.setattr(admin_routes.settings, "platform_admin_emails", "")
    h = register(client)                                                  # admin of their own workspace
    verify(email_of(client, h))
    assert client.get("/admin/overview", headers=h).status_code == 404


def test_listing_an_email_is_not_enough_without_a_verified_address(client, monkeypatch):
    h = register(client)
    monkeypatch.setattr(admin_routes.settings, "platform_admin_emails", email_of(client, h))
    assert client.get("/admin/overview", headers=h).status_code == 404    # someone could have signed up with that address
    assert client.get("/auth/me", headers=h).json()["platform_admin"] is False
    verify(email_of(client, h))
    assert client.get("/admin/overview", headers=h).status_code == 200
    assert client.get("/auth/me", headers=h).json()["platform_admin"] is True


def test_overview_counts_workspaces_plans_and_revenue(client, boss):
    other = register(client)
    set_plan(client, other, "pro")
    data = client.get("/admin/overview", headers=boss).json()
    assert data["workspaces"] >= 2 and data["by_plan"]["pro"] >= 1 and data["by_plan"]["free"] >= 1
    assert data["mrr_usd"] == 0                                           # comped plans are not revenue
    assert data["signups_7d"] >= 2 and data["users"] >= 2


def test_workspace_list_shows_sync_health_and_supports_search(client, boss, fake):
    h = register(client, "Searchable")
    client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    mine = email_of(client, h)
    rows = client.get("/admin/workspaces", headers=boss, params={"q": mine[:12]}).json()["data"]
    assert [r["owner"] for r in rows] == [mine]
    row = rows[0]
    assert row["connected"] is True and row["plan"] == "free" and row["members"] == 1
    blob = str(rows)
    assert KEY_A not in blob and WALLET_A not in blob                      # no secrets in the console
    assert client.get("/admin/workspaces", headers=boss, params={"q": "no-such-thing-xyz"}).json()["data"] == []


def test_setting_a_plan_is_validated_applied_and_audited(client, boss):
    h = register(client)
    org = client.get("/workspace", headers=h).json()["workspace"]["id"]
    assert client.patch(f"/admin/workspaces/{org}/plan", headers=boss, json={"plan": "platinum"}).status_code == 400
    assert client.patch("/admin/workspaces/nope/plan", headers=boss, json={"plan": "pro"}).status_code == 404
    assert client.patch(f"/admin/workspaces/{org}/plan", headers=boss, json={"plan": "business"}).json()["plan"] == "business"
    assert client.get("/workspace", headers=h).json()["plan"]["limits"]["members"] == 50
    trail = client.get("/workspace/audit", headers=h).json()["data"]
    assert trail[0]["action"] == "plan.changed" and email_of(client, boss) in trail[0]["actor"]


# ───────────────────────── public status ─────────────────────────

def test_status_is_public_and_reveals_nothing_about_workspaces(client):
    r = client.get("/status")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("operational", "degraded") and body["checked_at"].endswith("Z")
    assert {c["name"] for c in body["components"]} >= {"Database", "Scheduled data refresh"}
    assert all(set(c) == {"name", "configured"} for c in body["optional"])
    assert "workspace" not in r.text.lower().replace("web application", "")


def test_status_degrades_when_the_scheduled_refresh_is_failing_or_stalled(client, monkeypatch):
    monkeypatch.setitem(scheduler.progress, "last_error", "RuntimeError")
    assert client.get("/status").json()["status"] == "degraded"
    monkeypatch.setitem(scheduler.progress, "last_error", None)
    monkeypatch.setitem(scheduler.progress, "last_run", 1.0)               # a very long time ago
    assert client.get("/status").json()["status"] == "degraded"
    monkeypatch.setitem(scheduler.progress, "last_run", None)
    monkeypatch.setitem(scheduler.progress, "started", __import__("time").time())
    assert client.get("/status").json()["status"] == "operational"

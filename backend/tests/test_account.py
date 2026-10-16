import json

import pytest

from conftest import register, set_plan, KEY_A, WALLET_A
from app.core.database import SessionLocal
from app.models.alerts import AlertChannel
from app.models.audit import AuditEvent
from app.models.organization import Organization, BlockradarConnection
from app.models.stored import StoredAddress, StoredTransaction
from app.models.user import User
from app.services import account, netsafe

PASSWORD = "password123"


def workspace(client, h):
    return client.get("/workspace", headers=h).json()["workspace"]


def email_of(client, h):
    return client.get("/auth/me", headers=h).json()["email"]


def delete_workspace(client, h, name=None, password=PASSWORD):
    name = name if name is not None else workspace(client, h)["name"]
    return client.request("DELETE", "/workspace", headers=h, json={"confirm_name": name, "password": password})


def delete_account(client, h, email=None, password=PASSWORD):
    email = email if email is not None else email_of(client, h)
    return client.request("DELETE", "/account", headers=h, json={"confirm_email": email, "password": password})


def join(client, admin, email):
    token = client.post("/workspace/invites", headers=admin, json={"role": "member"}).json()["token"]
    r = client.post("/auth/register", json={"email": email, "password": PASSWORD, "name": "Member", "invite_token": token})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def actions(client, h):
    return [e["action"] for e in client.get("/workspace/audit", headers=h).json()["data"]]


@pytest.fixture()
def pro(client):
    h = register(client)
    set_plan(client, h, "pro")
    return h


# ───────────────────────── audit log ─────────────────────────

def test_sensitive_actions_are_recorded_with_who_and_what(client, pro, monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["93.184.216.34"])
    h = pro
    token = client.post("/workspace/invites", headers=h, json={"email": "new@example.com", "role": "member"}).json()
    inv_id = client.get("/workspace/invites", headers=h).json()["data"][0]["id"]
    client.delete(f"/workspace/invites/{inv_id}", headers=h)
    ch = client.post("/workspace/alerts/channels", headers=h, json={"kind": "webhook", "target": "https://hooks.example.com/secret-path-123", "label": "Ops"}).json()
    client.patch(f"/workspace/alerts/channels/{ch['id']}", headers=h, json={"enabled": False})
    client.delete(f"/workspace/alerts/channels/{ch['id']}", headers=h)
    got = actions(client, h)
    for a in ("invite.created", "invite.revoked", "alert_channel.added", "alert_channel.toggled", "alert_channel.removed"):
        assert a in got
    rows = client.get("/workspace/audit", headers=h).json()["data"]
    assert all(r["actor"] == email_of(client, h) and r["at"] for r in rows)
    text = json.dumps(rows)
    assert token["token"] not in text and "secret-path-123" not in text            # secrets never reach the trail


def test_connecting_and_role_changes_are_recorded_without_the_api_key(client, fake):
    admin = register(client)
    set_plan(client, admin, "pro")
    member = join(client, admin, "m1@example.com")
    assert client.put("/workspace/connection", headers=admin, json={"api_key": KEY_A, "wallet_id": WALLET_A}).status_code == 200
    mid = next(m["id"] for m in client.get("/workspace/members", headers=admin).json()["data"] if m["email"] == "m1@example.com")
    client.patch(f"/workspace/members/{mid}", headers=admin, json={"role": "admin"})
    client.delete(f"/workspace/members/{mid}", headers=admin)
    got = client.get("/workspace/audit", headers=admin).json()["data"]
    assert {"connection.saved", "member.role_changed", "member.removed"} <= {e["action"] for e in got}
    assert KEY_A not in json.dumps(got) and WALLET_A not in json.dumps(got)         # the wallet id is masked
    assert member                                                                     # (joined before being removed)


def test_the_audit_log_is_admin_only_and_private_to_the_workspace(client, pro):
    a, b = pro, register(client)
    member = join(client, a, "m2@example.com")
    assert client.get("/workspace/audit", headers=member).status_code == 403
    client.post("/workspace/invites", headers=a, json={"role": "member"})
    assert "invite.created" in actions(client, a)
    assert "invite.created" not in actions(client, b)


def test_a_failing_audit_write_never_breaks_the_action(client, pro, monkeypatch):
    from app.services import audit
    monkeypatch.setattr(audit, "AuditEvent", lambda **kw: (_ for _ in ()).throw(RuntimeError("db down")))
    assert client.post("/workspace/invites", headers=pro, json={"role": "member"}).status_code == 200


# ───────────────────────── export ─────────────────────────

def test_export_contains_the_workspace_data_and_no_secrets(client, fake, monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["93.184.216.34"])
    h = register(client)
    set_plan(client, h, "pro")
    client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    hook = "https://hooks.example.com/very-secret-token"
    client.post("/workspace/alerts/channels", headers=h, json={"kind": "webhook", "target": hook, "label": "Ops"})
    r = client.get("/workspace/export", headers=h)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"] and r.headers["cache-control"] == "no-store"
    data = r.json()
    assert data["workspace"]["plan"] == "pro" and data["members"][0]["email"] == email_of(client, h)
    assert data["blockradar_connection"]["api_key_last4"] == KEY_A[-4:] and data["alert_channels"][0]["label"] == "Ops"
    blob = r.text
    for secret in (KEY_A, WALLET_A, "very-secret-token", "hashed_password", "$2b$"):
        assert secret not in blob
    assert "workspace.exported" in actions(client, h)


def test_export_is_admin_only(client, pro):
    member = join(client, pro, "m3@example.com")
    assert client.get("/workspace/export", headers=member).status_code == 403


# ───────────────────────── deleting a workspace ─────────────────────────

def test_deleting_a_workspace_removes_everything_and_only_that_workspace(client, fake):
    a, b = register(client), register(client)
    for h in (a, b):
        client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    org_a, org_b = workspace(client, a)["id"], workspace(client, b)["id"]
    email_a = email_of(client, a)

    assert delete_workspace(client, a).json() == {"deleted": True}

    with SessionLocal() as db:
        for model in account.ORG_TABLES:
            assert db.query(model).filter(model.org_id == org_a).count() == 0
        assert db.query(Organization).filter(Organization.id == org_a).count() == 0
        assert db.query(User).filter(User.email == email_a).count() == 0
        assert db.query(StoredAddress).filter(StoredAddress.org_id == org_b).count() > 0       # the other workspace is untouched
        assert db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_b).count() == 1
    assert client.get("/workspace", headers=a).status_code == 401                              # the old session is dead
    assert client.get("/workspace", headers=b).status_code == 200


@pytest.mark.parametrize("name,password,status", [("Wrong name", PASSWORD, 400), (None, "wrong-password", 400), (None, "", 400)])
def test_deleting_a_workspace_needs_the_exact_name_and_the_password(client, name, password, status):
    h = register(client)
    assert delete_workspace(client, h, name=name, password=password).status_code == status
    assert client.get("/workspace", headers=h).status_code == 200


def test_only_admins_can_delete_a_workspace(client, pro):
    member = join(client, pro, "m4@example.com")
    assert delete_workspace(client, member, name=workspace(client, pro)["name"]).status_code == 403
    assert client.get("/workspace", headers=pro).status_code == 200


def test_deleting_cancels_the_subscription_first_and_refuses_if_it_cannot(client, monkeypatch):
    from app.services import billing
    s = billing.settings
    monkeypatch.setattr(s, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(s, "stripe_price_pro", "price_pro")
    monkeypatch.setattr(s, "stripe_price_business", "price_biz")
    cancelled = []
    monkeypatch.setattr(account.stripe.Subscription, "cancel", staticmethod(lambda sid, **kw: cancelled.append(sid)))
    h = register(client)
    with SessionLocal() as db:
        db.query(Organization).filter(Organization.id == workspace(client, h)["id"]).update({"stripe_subscription_id": "sub_9", "subscription_status": "active"})
        db.commit()
    monkeypatch.setattr(account.stripe.Subscription, "cancel", staticmethod(lambda sid, **kw: (_ for _ in ()).throw(RuntimeError("stripe down"))))
    assert delete_workspace(client, h).status_code == 502
    assert client.get("/workspace", headers=h).status_code == 200                       # nothing was deleted
    monkeypatch.setattr(account.stripe.Subscription, "cancel", staticmethod(lambda sid, **kw: cancelled.append(sid)))
    assert delete_workspace(client, h).status_code == 200 and cancelled == ["sub_9"]


# ───────────────────────── deleting an account ─────────────────────────

def test_a_member_can_delete_their_account_and_the_workspace_survives(client, pro):
    member = join(client, pro, "leaver@example.com")
    assert delete_account(client, member).json() == {"deleted": True, "workspace_deleted": False}
    assert client.get("/workspace", headers=member).status_code == 401
    assert client.get("/workspace", headers=pro).status_code == 200
    assert "member.left" in actions(client, pro)
    with SessionLocal() as db:
        assert db.query(User).filter(User.email == "leaver@example.com").count() == 0


def test_the_only_member_deleting_their_account_deletes_the_workspace(client):
    h = register(client)
    org = workspace(client, h)["id"]
    assert delete_account(client, h).json() == {"deleted": True, "workspace_deleted": True}
    with SessionLocal() as db:
        assert db.query(Organization).filter(Organization.id == org).count() == 0


def test_the_last_admin_cannot_abandon_their_team(client, pro):
    join(client, pro, "stays@example.com")
    r = delete_account(client, pro)
    assert r.status_code == 400 and "only admin" in r.json()["detail"]
    assert client.get("/workspace", headers=pro).status_code == 200


def test_account_deletion_needs_the_email_and_the_password(client):
    h = register(client)
    assert delete_account(client, h, email="someone-else@example.com").status_code == 400
    assert delete_account(client, h, password="nope").status_code == 400
    assert client.get("/workspace", headers=h).status_code == 200

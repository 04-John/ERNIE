from datetime import datetime, timedelta

from conftest import register, KEY_A, WALLET_A
from app.core.database import SessionLocal
from app.models.organization import Invite
from app.models.user import User


def invite(client, h, email=None, role="member"):
    body = {"role": role}
    if email:
        body["email"] = email
    return client.post("/workspace/invites", headers=h, json=body)


def join(client, token, email, name="New Member"):
    r = client.post("/auth/register", json={"email": email, "password": "password123", "name": name, "invite_token": token})
    return r


def auth(r):
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_invite_token_is_shown_once_and_stored_hashed(client):
    admin = register(client)
    r = invite(client, admin)
    assert r.status_code == 200
    token = r.json()["token"]
    assert len(token) >= 32

    listed = client.get("/workspace/invites", headers=admin)
    assert token not in listed.text and len(listed.json()["data"]) == 1
    with SessionLocal() as db:
        row = db.query(Invite).filter(Invite.id == r.json()["id"]).first()
        assert row.token_hash != token and token not in row.token_hash


def test_invited_user_joins_the_same_workspace_and_sees_its_data(client):
    admin = register(client, "Admin")
    client.put("/workspace/connection", headers=admin, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    token = invite(client, admin).json()["token"]

    # public preview works without logging in
    prev = client.get(f"/auth/invite/{token}")
    assert prev.status_code == 200 and prev.json()["role"] == "member"

    r = join(client, token, "teammate@example.com")
    assert r.status_code == 200
    mh = auth(r)
    ws = client.get("/workspace", headers=mh).json()
    assert ws["role"] == "member"
    assert client.get("/analytics/summary", headers=mh).json()["data"]["total_wallets"] == 3   # admin's data

    # a stranger's workspace is still separate (demo data)
    stranger = register(client, "Stranger")
    assert client.get("/analytics/summary", headers=stranger).json()["data"]["total_wallets"] == 7
    # same workspace id for admin and teammate, different for stranger
    admin_ws = client.get("/workspace", headers=admin).json()["workspace"]["id"]
    assert ws["workspace"]["id"] == admin_ws
    assert client.get("/workspace", headers=stranger).json()["workspace"]["id"] != admin_ws


def test_invite_is_single_use(client):
    admin = register(client)
    token = invite(client, admin).json()["token"]
    assert join(client, token, "first@example.com").status_code == 200
    assert join(client, token, "second@example.com").status_code == 400
    assert client.get(f"/auth/invite/{token}").status_code == 404


def test_email_bound_invite_only_works_for_that_email(client):
    admin = register(client)
    token = invite(client, admin, email="Alice@Example.com").json()["token"]
    wrong = join(client, token, "mallory@example.com")
    assert wrong.status_code == 400 and "different email" in wrong.json()["detail"]
    assert join(client, token, "alice@example.com").status_code == 200


def test_expired_revoked_and_garbage_tokens_are_rejected(client):
    admin = register(client)

    r = invite(client, admin)
    with SessionLocal() as db:
        inv = db.query(Invite).filter(Invite.id == r.json()["id"]).first()
        inv.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
    assert join(client, r.json()["token"], "late@example.com").status_code == 400

    r2 = invite(client, admin)
    assert client.delete(f"/workspace/invites/{r2.json()['id']}", headers=admin).status_code == 200
    assert join(client, r2.json()["token"], "revoked@example.com").status_code == 400

    assert join(client, "not-a-real-token", "x@example.com").status_code == 400
    assert client.get("/auth/invite/not-a-real-token").status_code == 404


def test_members_cannot_manage_the_team(client):
    admin = register(client)
    member = auth(join(client, invite(client, admin).json()["token"], "m@example.com"))

    assert invite(client, member).status_code == 403
    assert client.get("/workspace/invites", headers=member).status_code == 403
    members = client.get("/workspace/members", headers=member).json()["data"]
    assert len(members) == 2                                          # they can see the team
    other_id = next(m["id"] for m in members if not m["is_you"])
    assert client.patch(f"/workspace/members/{other_id}", headers=member, json={"role": "member"}).status_code == 403
    assert client.delete(f"/workspace/members/{other_id}", headers=member).status_code == 403


def test_last_admin_and_self_protection(client):
    admin = register(client)
    me = client.get("/workspace/members", headers=admin).json()["data"][0]
    assert client.patch(f"/workspace/members/{me['id']}", headers=admin, json={"role": "member"}).status_code == 400
    assert client.delete(f"/workspace/members/{me['id']}", headers=admin).status_code == 400
    assert client.patch(f"/workspace/members/{me['id']}", headers=admin, json={"role": "owner"}).status_code == 400


def test_admin_can_promote_demote_and_remove_and_removed_user_loses_access(client):
    admin = register(client)
    mh = auth(join(client, invite(client, admin).json()["token"], "temp@example.com"))
    members = client.get("/workspace/members", headers=admin).json()["data"]
    target = next(m for m in members if not m["is_you"])

    assert client.patch(f"/workspace/members/{target['id']}", headers=admin, json={"role": "admin"}).status_code == 200
    assert client.patch(f"/workspace/members/{target['id']}", headers=admin, json={"role": "member"}).status_code == 200

    assert client.get("/workspace", headers=mh).status_code == 200
    assert client.delete(f"/workspace/members/{target['id']}", headers=admin).status_code == 200
    assert client.get("/workspace", headers=mh).status_code == 401            # removed: token no longer works


def test_cannot_touch_another_workspaces_members_or_invites(client):
    a, b = register(client, "A"), register(client, "B")
    b_member = client.get("/workspace/members", headers=b).json()["data"][0]
    b_invite = invite(client, b).json()

    assert client.patch(f"/workspace/members/{b_member['id']}", headers=a, json={"role": "member"}).status_code == 404
    assert client.delete(f"/workspace/members/{b_member['id']}", headers=a).status_code == 404
    assert client.delete(f"/workspace/invites/{b_invite['id']}", headers=a).status_code == 404
    assert client.get("/workspace/invites", headers=a).json()["data"] == []


def test_cannot_invite_an_existing_account(client):
    admin = register(client)
    with SessionLocal() as db:
        existing = db.query(User).first().email
    assert invite(client, admin, email=existing).status_code == 400

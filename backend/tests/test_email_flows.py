import re
import time
from datetime import datetime, timedelta

from conftest import register, set_plan
from app.core.database import SessionLocal
from app.models.auth_token import AuthToken
from app.models.user import User
from app.services.auth import create_user, link_google_account, hash_password


def token_from(mail, key):
    m = re.search(rf"\?{key}=([\w-]+)", mail["text"])
    assert m, mail["text"]
    return m.group(1)


def new_user(client, email="reset@example.com", password="password123"):
    r = client.post("/auth/register", json={"email": email, "password": password, "name": "Reset Me"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


# ───────────────────────── password reset ─────────────────────────

def test_forgot_password_never_reveals_whether_an_account_exists(client, mailbox):
    new_user(client, "real@example.com")
    mailbox.clear()
    a = client.post("/auth/forgot-password", json={"email": "real@example.com"})
    b = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    assert [m["to"] for m in mailbox] == ["real@example.com"]          # only the real account got mail


def test_full_reset_flow_and_link_is_single_use(client, mailbox):
    new_user(client, "flow@example.com")
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "flow@example.com"})
    token = token_from(mailbox[0], "reset")

    assert client.post("/auth/reset-password", json={"token": token, "password": "brand-new-pass-1"}).status_code == 200
    assert login(client, "flow@example.com", "brand-new-pass-1").status_code == 200
    assert login(client, "flow@example.com", "password123").status_code == 401
    assert client.post("/auth/reset-password", json={"token": token, "password": "another-pass-22"}).status_code == 400   # burned


def test_a_password_reset_ends_existing_sessions(client, mailbox):
    h = new_user(client, "sessions@example.com")
    assert client.get("/auth/me", headers=h).status_code == 200
    time.sleep(1.1)                                                     # JWT timestamps have 1s resolution
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "sessions@example.com"})
    client.post("/auth/reset-password", json={"token": token_from(mailbox[0], "reset"), "password": "brand-new-pass-1"})
    assert client.get("/auth/me", headers=h).status_code == 401         # the old session is dead
    fresh = login(client, "sessions@example.com", "brand-new-pass-1").json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {fresh}"}).status_code == 200


def test_a_too_short_password_does_not_burn_the_link(client, mailbox):
    new_user(client, "short@example.com")
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "short@example.com"})
    token = token_from(mailbox[0], "reset")
    assert client.post("/auth/reset-password", json={"token": token, "password": "short"}).status_code == 400
    assert client.post("/auth/reset-password", json={"token": token, "password": "long-enough-1"}).status_code == 200


def test_expired_and_garbage_reset_tokens_are_rejected(client, mailbox):
    new_user(client, "exp@example.com")
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "exp@example.com"})
    token = token_from(mailbox[0], "reset")
    with SessionLocal() as db:
        db.query(AuthToken).filter(AuthToken.purpose == "reset").update({"expires_at": datetime.utcnow() - timedelta(minutes=1)})
        db.commit()
    assert client.post("/auth/reset-password", json={"token": token, "password": "long-enough-1"}).status_code == 400
    assert client.post("/auth/reset-password", json={"token": "nonsense", "password": "long-enough-1"}).status_code == 400


def test_a_newer_reset_link_invalidates_the_older_one(client, mailbox):
    new_user(client, "two@example.com")
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "two@example.com"})
    client.post("/auth/forgot-password", json={"email": "two@example.com"})
    old, new = token_from(mailbox[0], "reset"), token_from(mailbox[1], "reset")
    assert client.post("/auth/reset-password", json={"token": old, "password": "long-enough-1"}).status_code == 400
    assert client.post("/auth/reset-password", json={"token": new, "password": "long-enough-1"}).status_code == 200


def test_reset_emails_are_rate_limited_per_address(client, mailbox):
    new_user(client, "flood@example.com")
    mailbox.clear()
    for _ in range(5):
        assert client.post("/auth/forgot-password", json={"email": "flood@example.com"}).status_code == 200
    assert len(mailbox) == 3                                            # the victim's inbox isn't flooded


def test_tokens_are_stored_hashed(client, mailbox):
    new_user(client, "hash@example.com")
    mailbox.clear()
    client.post("/auth/forgot-password", json={"email": "hash@example.com"})
    token = token_from(mailbox[0], "reset")
    with SessionLocal() as db:
        assert db.query(AuthToken).filter(AuthToken.token_hash == token).count() == 0
        assert all(token not in r.token_hash for r in db.query(AuthToken).all())


def test_google_only_account_can_set_a_password_via_reset(client, mailbox):
    with SessionLocal() as db:
        create_user(db, email="g@example.com", name="G", google_id="google-123")
    client.post("/auth/forgot-password", json={"email": "g@example.com"})
    client.post("/auth/reset-password", json={"token": token_from(mailbox[-1], "reset"), "password": "now-has-password-1"})
    assert login(client, "g@example.com", "now-has-password-1").status_code == 200


# ───────────────────────── email verification ─────────────────────────

def test_registration_sends_a_verification_email_and_the_link_verifies(client, mailbox):
    h = new_user(client, "verify@example.com")
    assert len(mailbox) == 1 and mailbox[0]["to"] == "verify@example.com"
    me = client.get("/auth/me", headers=h).json()
    assert me["is_verified"] is False and me["email_enabled"] is True

    token = token_from(mailbox[0], "verify")
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    assert client.get("/auth/me", headers=h).json()["is_verified"] is True
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 400          # single use
    assert client.post("/auth/resend-verification", headers=h).json()["sent"] is False         # already verified


def test_resend_verification_is_rate_limited(client, mailbox):
    h = new_user(client, "resend@example.com")
    mailbox.clear()
    assert [client.post("/auth/resend-verification", headers=h).status_code for _ in range(4)] == [200, 200, 200, 429]
    assert len(mailbox) == 3


def test_everything_still_works_when_email_is_not_configured(client, mailbox):
    mailbox.enabled = False
    h = new_user(client, "noemail@example.com")
    assert mailbox == []                                                # nothing sent, nothing crashed
    assert client.get("/auth/me", headers=h).json()["email_enabled"] is False
    assert client.post("/auth/resend-verification", headers=h).json()["sent"] is False
    assert client.post("/auth/forgot-password", json={"email": "noemail@example.com"}).status_code == 200


# ───────────────────────── account pre-hijacking ─────────────────────────

def test_linking_google_to_an_unverified_password_account_removes_the_squatters_password(client):
    with SessionLocal() as db:
        squatter = create_user(db, email="victim@example.com", name="Squatter", password="squatter-pass-1")
        assert squatter.is_verified is False and squatter.hashed_password
        link_google_account(db, squatter, "google-victim")              # the real owner signs in with Google
        db.refresh(squatter)
        assert squatter.hashed_password is None and squatter.is_verified is True and squatter.google_id == "google-victim"
    assert login(client, "victim@example.com", "squatter-pass-1").status_code == 401


def test_linking_google_to_a_verified_account_keeps_its_password(client):
    with SessionLocal() as db:
        u = create_user(db, email="keep@example.com", name="Keep", password="my-own-pass-1")
        u.is_verified = True
        db.commit()
        link_google_account(db, u, "google-keep")
        db.refresh(u)
        assert u.hashed_password is not None
    assert login(client, "keep@example.com", "my-own-pass-1").status_code == 200


# ───────────────────────── emailed invites ─────────────────────────

def test_invite_can_be_emailed_and_the_emailed_link_works(client, mailbox):
    admin = register(client, "Admin")
    mailbox.clear()
    r = client.post("/workspace/invites", headers=admin, json={"email": "new@example.com", "role": "member", "send_email": True})
    assert r.status_code == 200 and r.json()["emailed"] is True
    assert [m["to"] for m in mailbox] == ["new@example.com"]
    token = token_from(mailbox[0], "invite")
    assert token == r.json()["token"]
    joined = client.post("/auth/register", json={"email": "new@example.com", "password": "password123", "name": "New", "invite_token": token})
    assert joined.status_code == 200


def test_invite_is_not_emailed_unless_asked_and_possible(client, mailbox):
    admin = register(client, "Admin")
    set_plan(client, admin, "pro")
    mailbox.clear()
    assert client.post("/workspace/invites", headers=admin, json={"email": "a@example.com"}).json()["emailed"] is False
    assert client.post("/workspace/invites", headers=admin, json={"send_email": True}).json()["emailed"] is False   # no address
    mailbox.enabled = False
    assert client.post("/workspace/invites", headers=admin, json={"email": "b@example.com", "send_email": True}).json()["emailed"] is False
    assert mailbox == []

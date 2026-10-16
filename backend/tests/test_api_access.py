import itertools
import json
import threading
import time

import pytest

from conftest import register, KEY_A, WALLET_A
from test_billing import FakeStripe, SECRET, send, org_of
from app.core.database import SessionLocal
from app.models.apiaccess import ApiKey, ApiUsageDaily, CreditTransaction
from app.models.organization import Organization
from app.services import apiaccess, billing
from app.services import auth as auth_service

_sessions = itertools.count(1)          # the test database is shared, and a replayed Stripe session id is (rightly) ignored


def join(client, admin, email):
    token = client.post("/workspace/invites", headers=admin, json={"role": "member"}).json()["token"]
    r = client.post("/auth/register", json={"email": email, "password": "password123", "name": "Member", "invite_token": token})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def bearer(key):
    return {"Authorization": f"Bearer {key}"}


def new_key(client, h, mode="live", name="Server"):
    r = client.post("/developer/keys", headers=h, json={"name": name, "mode": mode})
    assert r.status_code == 200, r.text
    return r.json()


def fund(org_id, credits):
    with SessionLocal() as db:
        db.query(Organization).filter(Organization.id == org_id).update({"credits": credits})
        db.commit()


def credits_of(client, h):
    return client.get("/developer", headers=h).json()["credits"]


def connect(client, h):
    r = client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    assert r.status_code == 200, r.text
    end = time.time() + 15
    while time.time() < end:
        if client.get("/analytics/status", headers=h).json().get("data_source") == "real":
            return
        time.sleep(0.2)
    raise AssertionError("workspace never finished syncing")


@pytest.fixture()
def live(client, fake):
    """A connected, funded workspace with a live key."""
    h = register(client)
    connect(client, h)
    org = org_of(client, h)
    fund(org, 1000)
    key = new_key(client, h)
    return {"h": h, "org": org, "key": key["key"], "id": key["id"]}


@pytest.fixture()
def stripe_on(monkeypatch):
    s = billing.settings
    monkeypatch.setattr(s, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(s, "stripe_webhook_secret", SECRET)
    monkeypatch.setattr(s, "stripe_price_pro", "price_pro")
    monkeypatch.setattr(s, "stripe_price_business", "price_biz")
    fake_stripe = FakeStripe()
    fake_stripe.install(monkeypatch)
    return fake_stripe


# ───────────────────────── keys ─────────────────────────

def test_a_key_is_shown_once_stored_hashed_and_listed_by_prefix_only(client):
    h = register(client)
    k = new_key(client, h, name="Prod backend")
    assert k["key"].startswith("ernie_live_") and len(k["key"]) > 40 and k["prefix"] == k["key"][:15]
    listed = client.get("/developer", headers=h)
    assert k["key"] not in listed.text and listed.json()["keys"][0]["prefix"] == k["prefix"]
    with SessionLocal() as db:
        row = db.query(ApiKey).filter(ApiKey.id == k["id"]).first()
        assert k["key"] not in row.key_hash and row.key_hash != k["key"] and len(row.key_hash) == 64


def test_only_admins_manage_keys_and_workspaces_are_isolated(client):
    admin = register(client)
    member = join(client, admin, "dev-member@example.com")
    assert client.post("/developer/keys", headers=member, json={"name": "x"}).status_code == 403
    k = new_key(client, admin)
    other = register(client)
    assert client.get("/developer", headers=other).json()["keys"] == []
    assert client.delete(f"/developer/keys/{k['id']}", headers=other).status_code == 404       # not theirs
    assert client.delete(f"/developer/keys/{k['id']}", headers=member).status_code == 403
    assert client.get("/developer", headers=member).status_code == 200                           # members may look


def test_key_count_is_capped_and_invalid_input_is_rejected(client):
    h = register(client)
    for i in range(apiaccess.MAX_ACTIVE_KEYS):
        new_key(client, h, name=f"k{i}")
        auth_service._attempts.clear()                       # this test makes many requests; don't trip the per-IP limiter
    assert client.post("/developer/keys", headers=h, json={"name": "one too many"}).status_code == 400
    assert client.post("/developer/keys", headers=register(client), json={"name": "", "mode": "live"}).status_code == 422
    assert client.post("/developer/keys", headers=register(client), json={"name": "x", "mode": "admin"}).status_code == 422


def test_revoking_a_key_stops_it_immediately_and_is_audited(client, live):
    assert client.get("/v1/health", headers=bearer(live["key"])).status_code == 200
    assert client.delete(f"/developer/keys/{live['id']}", headers=live["h"]).json() == {"revoked": True}
    assert client.get("/v1/health", headers=bearer(live["key"])).status_code == 401
    assert client.delete(f"/developer/keys/{live['id']}", headers=live["h"]).status_code == 404
    got = [e["action"] for e in client.get("/workspace/audit", headers=live["h"]).json()["data"]]
    assert "api_key.created" in got and "api_key.revoked" in got
    assert live["key"] not in json.dumps(client.get("/workspace/audit", headers=live["h"]).json())


# ───────────────────────── authentication ─────────────────────────

@pytest.mark.parametrize("header", [None, "Bearer ", "Bearer nonsense", "Bearer ernie_live_doesnotexist", "Basic abc", "ernie_live_x"])
def test_bad_credentials_are_rejected_without_detail(client, header):
    r = client.get("/v1/health", headers={"Authorization": header} if header else {})
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


def test_a_login_token_is_not_an_api_key_and_an_api_key_is_not_a_login(client, live):
    login = register(client)
    assert client.get("/v1/health", headers=login).status_code == 401
    assert client.get("/workspace", headers=bearer(live["key"])).status_code == 401
    assert client.get("/developer", headers=bearer(live["key"])).status_code == 401


# ───────────────────────── billing per call ─────────────────────────

def test_live_calls_are_charged_by_endpoint_and_report_the_balance(client, live):
    r = client.get("/v1/fintechs", headers=bearer(live["key"]))
    assert r.status_code == 200 and r.headers["x-credits-charged"] == "5" and r.headers["x-credits-remaining"] == "995"
    assert r.headers["x-ernie-mode"] == "live"
    body = r.json()
    assert body["total"] == len(body["data"]) >= 1 and set(body["data"][0]) >= {"id", "name", "risk", "risk_probability", "total_volume_usd"}
    one = client.get(f"/v1/fintechs/{body['data'][0]['id']}", headers=bearer(live["key"]))
    assert one.headers["x-credits-charged"] == "10" and one.headers["x-credits-remaining"] == "985"
    assert "score_breakdown" in one.json() and one.json()["score_breakdown"][0]["detail"]
    assert client.get("/v1/health", headers=bearer(live["key"])).headers["x-credits-charged"] == "2"
    assert client.get("/v1/insights", headers=bearer(live["key"])).status_code == 200
    assert credits_of(client, live["h"]) == 1000 - 5 - 10 - 2 - 2


def test_errors_and_the_usage_endpoint_are_free(client, live):
    assert client.get("/v1/fintechs/does-not-exist", headers=bearer(live["key"])).status_code == 404
    assert client.get("/v1/fintechs?risk=Nonsense", headers=bearer(live["key"])).status_code == 422
    assert client.get("/v1/fintechs?limit=1000", headers=bearer(live["key"])).status_code == 422
    u = client.get("/v1/usage", headers=bearer(live["key"])).json()
    assert u["credits_remaining"] == 1000 and u["mode"] == "live" and u["pricing"]["endpoints"]["fintechs.get"] == 10
    assert credits_of(client, live["h"]) == 1000


def test_an_empty_wallet_gets_a_402_and_no_data(client, live):
    fund(live["org"], 4)
    r = client.get("/v1/fintechs", headers=bearer(live["key"]))                 # costs 5
    assert r.status_code == 402 and "Top up" in r.json()["detail"] and "data" not in r.json()
    assert r.headers["x-credits-required"] == "5" and r.headers["x-credits-remaining"] == "4"
    assert client.get("/v1/health", headers=bearer(live["key"])).status_code == 200      # a cheaper call still fits
    assert credits_of(client, live["h"]) == 2


def test_filters_and_pagination(client, live):
    k = bearer(live["key"])
    everything = client.get("/v1/fintechs", headers=k).json()
    page = client.get("/v1/fintechs?limit=1&offset=1", headers=k).json()
    assert page["limit"] == 1 and page["offset"] == 1 and page["total"] == everything["total"]
    assert [f["id"] for f in page["data"]] == [everything["data"][1]["id"]]
    risks = {f["risk"] for f in everything["data"]}
    high = client.get("/v1/fintechs?risk=High", headers=k).json()
    assert all(f["risk"] == "High" for f in high["data"]) and high["total"] == sum(1 for f in everything["data"] if f["risk"] == "High")
    assert risks


def test_history_is_limited_by_the_plan(client, live):
    r = client.get("/v1/history?days=800", headers=bearer(live["key"]))
    assert r.status_code == 200 and r.json()["days"] == 30           # the Free plan keeps 30 days


def test_usage_is_counted_per_day_and_endpoint(client, live):
    for _ in range(3):
        client.get("/v1/health", headers=bearer(live["key"]))
    client.get("/v1/fintechs", headers=bearer(live["key"]))
    u = client.get("/developer/usage", headers=live["h"]).json()
    by = {e["endpoint"]: e for e in u["endpoints"]}
    assert by["health"] == {"endpoint": "health", "calls": 3, "credits": 6} and by["fintechs.list"]["calls"] == 1
    assert u["total_calls"] == 4 and u["total_credits"] == 11 and u["credits"] == 989 and len(u["days"]) == 1


# ───────────────────────── test keys ─────────────────────────

def test_test_keys_use_demo_data_for_free_and_never_touch_the_wallet(client, live):
    tk = new_key(client, live["h"], mode="test", name="Sandbox")["key"]
    assert tk.startswith("ernie_test_")
    r = client.get("/v1/fintechs", headers=bearer(tk))
    assert r.status_code == 200 and r.headers["x-ernie-mode"] == "test" and r.headers["x-credits-charged"] == "0"
    assert "x-credits-remaining" not in r.headers
    live_ids = {f["id"] for f in client.get("/v1/fintechs", headers=bearer(live["key"])).json()["data"]}
    test_ids = {f["id"] for f in r.json()["data"]}
    assert test_ids and test_ids.isdisjoint(live_ids)                            # demo data, never the workspace's own
    assert credits_of(client, live["h"]) == 995                                  # only the one live call was billed


def test_test_keys_work_with_no_credits_and_no_connection(client):
    h = register(client)
    tk = new_key(client, h, mode="test")["key"]
    assert client.get("/v1/health", headers=bearer(tk)).status_code == 200
    assert credits_of(client, h) == 0


def test_a_live_key_needs_a_connected_workspace(client):
    h = register(client)
    k = new_key(client, h)["key"]
    r = client.get("/v1/health", headers=bearer(k))
    assert r.status_code == 409 and "test key" in r.json()["detail"]


def test_another_workspaces_key_never_sees_your_data(client, fake):
    a, b = register(client), register(client)
    connect(client, a)
    fund(org_of(client, a), 100)
    ka = new_key(client, a)["key"]
    kb = new_key(client, b, mode="test")["key"]
    assert client.get("/v1/fintechs", headers=bearer(ka)).json()["total"] >= 1
    # b has no connection, so a live key for b can't read a's data either
    kb_live = new_key(client, b)["key"]
    assert client.get("/v1/fintechs", headers=bearer(kb_live)).status_code == 409
    assert kb


def test_rate_limits_apply_per_key(client, monkeypatch):
    monkeypatch.setitem(apiaccess.RATE_LIMITS_PER_MINUTE, "test", 3)
    h = register(client)
    k1, k2 = new_key(client, h, mode="test", name="a")["key"], new_key(client, h, mode="test", name="b")["key"]
    codes = [client.get("/v1/usage", headers=bearer(k1)).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    assert client.get("/v1/usage", headers=bearer(k1)).headers["retry-after"]
    assert client.get("/v1/usage", headers=bearer(k2)).status_code == 200        # another key has its own allowance


# ───────────────────────── the wallet is atomic ─────────────────────────

def test_concurrent_calls_can_never_overspend_the_wallet(client):
    h = register(client)
    org = org_of(client, h)
    fund(org, 10)
    results, lock = [], threading.Lock()

    def worker():
        try:
            with SessionLocal() as db:
                outcome = apiaccess.spend(db, org, 5, "fintechs.list")
        except Exception:                                  # a locked SQLite write is a failed spend, never a free one
            outcome = None
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with SessionLocal() as db:
        left = apiaccess.balance(db, org)
        charged = db.query(ApiUsageDaily).filter(ApiUsageDaily.org_id == org).all()
    succeeded = sum(1 for r in results if r is not None)
    assert left >= 0 and succeeded * 5 + left == 10 and succeeded <= 2
    assert sum(c.credits for c in charged) == succeeded * 5                        # what was taken is exactly what was recorded


# ───────────────────────── top-ups ─────────────────────────

def topup_event(org, usd, credits, session=None, paid="paid", amount=None, kind="credits"):
    session = session or f"cs_topup_{next(_sessions)}"
    return {"id": "evt_t", "type": "checkout.session.completed", "data": {"object": {
        "id": session, "mode": "payment", "customer": "cus_1", "payment_status": paid, "amount_total": amount if amount is not None else usd * 100,
        "client_reference_id": org, "metadata": {"org_id": org, "kind": kind, "credits": str(credits)}}}}


def test_topups_are_off_without_stripe_and_only_sell_listed_packs(client, monkeypatch):
    monkeypatch.setattr(billing.settings, "stripe_secret_key", "")
    h = register(client)
    r = client.post("/developer/topup", headers=h, json={"usd": 10})
    assert r.status_code == 503 and client.get("/developer", headers=h).json()["topups_available"] is False


def test_checkout_for_credits_names_the_pack_and_the_workspace(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    assert client.post("/developer/topup", headers=h, json={"usd": 7}).status_code == 400
    assert client.post("/developer/topup", headers=h, json={"usd": 0}).status_code == 400
    r = client.post("/developer/topup", headers=h, json={"usd": 50})
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test/")
    s = stripe_on.sessions[0]
    assert s["mode"] == "payment" and s["line_items"][0]["price_data"]["unit_amount"] == 5000
    assert s["metadata"] == {"org_id": org, "kind": "credits", "credits": "55000"} and "credits=success" in s["success_url"]
    member = join(client, h, "topup-member@example.com")
    assert client.post("/developer/topup", headers=member, json={"usd": 10}).status_code == 403


def test_a_paid_topup_adds_credits_once_even_if_stripe_retries(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    event = topup_event(org, 50, 55000)
    for _ in range(3):                                       # Stripe retries the same event
        assert send(client, event).status_code == 200
    assert credits_of(client, h) == 55000
    tx = client.get("/developer/usage", headers=h).json()["transactions"]
    assert len(tx) == 1 and tx[0]["credits"] == 55000 and tx[0]["balance_after"] == 55000
    assert send(client, topup_event(org, 10, 10000)).status_code == 200
    assert credits_of(client, h) == 65000
    assert "credits.added" in [e["action"] for e in client.get("/workspace/audit", headers=h).json()["data"]]


@pytest.mark.parametrize("event_kwargs", [
    {"paid": "unpaid"},                                   # not paid yet
    {"amount": 100},                                      # paid $1 but claims the $50 pack
    {"credits": 9_999_999},                               # tampered credit count
    {"kind": "something-else"},
])
def test_topups_that_do_not_check_out_credit_nothing(client, stripe_on, event_kwargs):
    h = register(client)
    org = org_of(client, h)
    kwargs = {"usd": 50, "credits": 55000, **event_kwargs}
    send(client, topup_event(org, **kwargs))
    assert credits_of(client, h) == 0


def test_a_topup_event_for_an_unknown_workspace_is_acknowledged_and_ignored(client, stripe_on):
    assert send(client, topup_event("no-such-org", 10, 10000)).status_code == 200


def test_subscriptions_and_topups_do_not_interfere(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    send(client, topup_event(org, 10, 10000))
    sub = {"id": "evt_s", "type": "checkout.session.completed", "data": {"object": {
        "id": "cs_sub", "mode": "subscription", "customer": "cus_1", "subscription": "sub_1", "payment_status": "paid",
        "client_reference_id": org, "metadata": {"org_id": org, "plan": "pro"}}}}
    send(client, sub)
    assert client.get("/workspace", headers=h).json()["plan"]["id"] == "pro" and credits_of(client, h) == 10000


# ───────────────────────── deletion and export ─────────────────────────

def test_export_lists_keys_without_secrets_and_deletion_removes_everything(client, live):
    export = client.get("/workspace/export", headers=live["h"])
    assert export.json()["api"]["credits"] == 1000 and export.json()["api"]["keys"][0]["prefix"] == live["key"][:15]
    assert live["key"] not in export.text and "key_hash" not in export.text
    name = client.get("/workspace", headers=live["h"]).json()["workspace"]["name"]
    r = client.request("DELETE", "/workspace", headers=live["h"], json={"confirm_name": name, "password": "password123"})
    assert r.status_code == 200
    with SessionLocal() as db:
        assert db.query(ApiKey).filter(ApiKey.org_id == live["org"]).count() == 0
        assert db.query(CreditTransaction).filter(CreditTransaction.org_id == live["org"]).count() == 0
    assert client.get("/v1/health", headers=bearer(live["key"])).status_code == 401

import hashlib
import hmac
import json
import time

import pytest

from conftest import register
from app.core.database import SessionLocal
from app.models.organization import Organization
from app.services import billing

SECRET = "whsec_test_secret"


class FakeStripe:
    def __init__(self):
        self.customers, self.sessions, self.portals = [], [], []

    def install(self, monkeypatch):
        def customer(**kw):
            self.customers.append(kw)
            return {"id": f"cus_{len(self.customers)}"}

        def session(**kw):
            self.sessions.append(kw)
            return {"url": f"https://checkout.stripe.test/{len(self.sessions)}"}

        def portal(**kw):
            self.portals.append(kw)
            return {"url": "https://billing.stripe.test/portal"}

        monkeypatch.setattr(billing.stripe.Customer, "create", staticmethod(customer))
        monkeypatch.setattr(billing.stripe.checkout.Session, "create", staticmethod(session))
        monkeypatch.setattr(billing.stripe.billing_portal.Session, "create", staticmethod(portal))


@pytest.fixture()
def stripe_on(monkeypatch):
    s = billing.settings
    monkeypatch.setattr(s, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(s, "stripe_webhook_secret", SECRET)
    monkeypatch.setattr(s, "stripe_price_pro", "price_pro")
    monkeypatch.setattr(s, "stripe_price_business", "price_biz")
    fake = FakeStripe()
    fake.install(monkeypatch)
    return fake


def org_of(client, h):
    org_id = client.get("/workspace", headers=h).json()["workspace"]["id"]
    return org_id


def row(org_id):
    with SessionLocal() as db:
        o = db.query(Organization).filter(Organization.id == org_id).first()
        return {"plan": o.plan, "customer": o.stripe_customer_id, "sub": o.stripe_subscription_id, "status": o.subscription_status}


def signed(event, secret=SECRET, ts=None):
    body = json.dumps(event).encode()
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, {"Stripe-Signature": f"t={ts},v1={sig}", "Content-Type": "application/json"}


def send(client, event, **kw):
    body, headers = signed(event, **kw)
    return client.post("/billing/webhook", content=body, headers=headers)


def completed(org_id, plan="pro", customer="cus_1", sub="sub_1", paid="paid"):
    return {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {
        "mode": "subscription", "customer": customer, "subscription": sub, "payment_status": paid,
        "client_reference_id": org_id, "metadata": {"org_id": org_id, "plan": plan}}}}


def subscription(org_id, kind="updated", status="active", price="price_pro", sub="sub_1", customer="cus_1"):
    return {"id": "evt_2", "type": f"customer.subscription.{kind}", "data": {"object": {
        "id": sub, "customer": customer, "status": status, "metadata": {"org_id": org_id},
        "items": {"data": [{"price": {"id": price}}]}}}}


# ───────────────────────── availability ─────────────────────────

def test_without_stripe_keys_billing_is_off_but_plans_are_public(client):
    assert client.get("/billing/plans").json()["data"][1]["id"] == "pro"       # no auth needed
    h = register(client)
    assert client.get("/billing", headers=h).json()["enabled"] is False
    r = client.post("/billing/checkout", headers=h, json={"plan": "pro"})
    assert r.status_code == 503 and "Contact us" in r.json()["detail"]
    assert client.post("/billing/webhook", content=b"{}").status_code == 503


def test_payments_stay_off_until_the_webhook_can_deliver_what_was_paid_for(client, stripe_on, monkeypatch):
    monkeypatch.setattr(billing.settings, "stripe_webhook_secret", "")
    h = register(client)
    assert client.get("/billing", headers=h).json()["enabled"] is False
    assert client.post("/billing/checkout", headers=h, json={"plan": "pro"}).status_code == 503
    assert client.post("/developer/topup", headers=h, json={"usd": 10}).status_code == 503
    assert client.get("/developer", headers=h).json()["topups_available"] is False
    assert stripe_on.sessions == []                                                # nobody was sent to pay


def test_checkout_and_portal_need_a_signed_in_admin(client, stripe_on):
    assert client.post("/billing/checkout", json={"plan": "pro"}).status_code in (401, 403)
    assert client.post("/billing/portal").status_code in (401, 403)


# ───────────────────────── checkout ─────────────────────────

def test_checkout_creates_a_customer_once_and_ties_the_session_to_the_workspace(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    r = client.post("/billing/checkout", headers=h, json={"plan": "business"})
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test/")
    s = stripe_on.sessions[0]
    assert s["mode"] == "subscription" and s["line_items"] == [{"price": "price_biz", "quantity": 1}]
    assert s["client_reference_id"] == org and s["metadata"] == {"org_id": org, "plan": "business"}
    assert s["subscription_data"]["metadata"]["org_id"] == org
    assert "billing=success" in s["success_url"]
    client.post("/billing/checkout", headers=h, json={"plan": "pro"})
    assert len(stripe_on.customers) == 1                                           # the customer is reused
    assert row(org)["customer"] == "cus_1" and row(org)["plan"] == "free"           # paying hasn't happened yet


def test_checkout_only_sells_paid_plans(client, stripe_on):
    h = register(client)
    for plan in ("free", "enterprise", ""):
        assert client.post("/billing/checkout", headers=h, json={"plan": plan}).status_code == 400
    assert stripe_on.sessions == []


def test_an_active_subscriber_is_sent_to_the_portal_instead_of_a_second_checkout(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    assert send(client, completed(org)).status_code == 200
    assert client.post("/billing/checkout", headers=h, json={"plan": "business"}).status_code == 409
    r = client.post("/billing/portal", headers=h)
    assert r.status_code == 200 and r.json()["url"] == "https://billing.stripe.test/portal"
    assert stripe_on.portals[0]["customer"] == "cus_1"


def test_portal_needs_a_billing_account(client, stripe_on):
    assert client.post("/billing/portal", headers=register(client)).status_code == 400


def test_stripe_failures_are_not_leaked_to_the_customer(client, stripe_on, monkeypatch):
    def boom(**kw):
        raise RuntimeError("sk_test_secret_details")
    monkeypatch.setattr(billing.stripe.checkout.Session, "create", staticmethod(boom))
    r = client.post("/billing/checkout", headers=register(client), json={"plan": "pro"})
    assert r.status_code == 502 and "sk_test" not in r.text


# ───────────────────────── webhook: trust ─────────────────────────

def test_unsigned_or_forged_webhooks_change_nothing(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    body, _ = signed(completed(org))
    assert client.post("/billing/webhook", content=body).status_code == 400                                     # no signature
    assert client.post("/billing/webhook", content=body, headers={"Stripe-Signature": "t=1,v1=bad"}).status_code == 400
    forged, headers = signed(completed(org), secret="whsec_attacker")
    assert client.post("/billing/webhook", content=forged, headers=headers).status_code == 400
    old, headers = signed(completed(org), ts=int(time.time()) - 3600)                                            # replay of an old event
    assert client.post("/billing/webhook", content=old, headers=headers).status_code == 400
    assert row(org)["plan"] == "free"


# ───────────────────────── webhook: lifecycle ─────────────────────────

def test_paying_upgrades_the_plan_and_unlocks_the_limits(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    assert client.get("/workspace", headers=h).json()["plan"]["limits"]["members"] == 2
    assert send(client, completed(org, plan="pro")).status_code == 200
    assert row(org) == {"plan": "pro", "customer": "cus_1", "sub": "sub_1", "status": "active"}
    assert client.get("/workspace", headers=h).json()["plan"]["limits"]["members"] == 10
    assert client.get("/billing", headers=h).json()["has_subscription"] is True


def test_an_unpaid_checkout_does_not_upgrade(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    send(client, completed(org, paid="unpaid"))
    assert row(org)["plan"] == "free"


def test_plan_changes_cancellation_and_failed_payments_follow_stripe(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    send(client, completed(org, plan="pro"))
    send(client, subscription(org, status="active", price="price_biz"))                  # upgraded in the portal
    assert row(org)["plan"] == "business"
    send(client, subscription(org, status="past_due", price="price_biz"))                # card failed; Stripe is retrying
    assert row(org)["plan"] == "business" and row(org)["status"] == "past_due"
    send(client, subscription(org, status="unpaid", price="price_biz"))                  # retries exhausted
    assert row(org)["plan"] == "free"
    send(client, subscription(org, status="active", price="price_pro"))                  # they fixed it
    assert row(org)["plan"] == "pro"
    send(client, subscription(org, kind="deleted", status="canceled", price="price_pro"))
    assert row(org) == {"plan": "free", "customer": "cus_1", "sub": None, "status": "canceled"}


def test_a_late_event_about_an_old_subscription_cannot_downgrade_a_new_one(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    send(client, completed(org, plan="pro", sub="sub_new"))
    assert send(client, subscription(org, kind="deleted", status="canceled", sub="sub_old")).status_code == 200
    assert row(org)["plan"] == "pro" and row(org)["sub"] == "sub_new"


def test_duplicate_and_unknown_events_are_harmless(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    for _ in range(3):
        assert send(client, completed(org)).status_code == 200
    assert row(org)["plan"] == "pro"
    assert send(client, completed("no-such-workspace")).status_code == 200                 # Stripe must get a 200 or it retries forever
    assert send(client, {"id": "e", "type": "invoice.paid", "data": {"object": {}}}).status_code == 200


def test_an_event_for_a_known_customer_finds_the_workspace_without_metadata(client, stripe_on):
    h = register(client)
    org = org_of(client, h)
    send(client, completed(org, customer="cus_77"))
    event = subscription(org, status="canceled", customer="cus_77")
    event["data"]["object"]["metadata"] = {}
    send(client, event)
    assert row(org)["plan"] == "free"

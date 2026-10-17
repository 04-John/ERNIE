import math
import os
import tempfile
from datetime import datetime, timedelta, timezone

# Configure BEFORE the app is imported (settings and the DB engine are created at import time)
_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update(
    DATABASE_URL=f"sqlite:///{_db}",
    SECRET_KEY="test-secret-key-" + "x" * 32,
    ENCRYPTION_KEY="test-encryption-key",
    DATA_MODE="real",
    WARM_DEMO="false",
    DEBUG="false",
    BOOTSTRAP_ADMIN_EMAIL="",
    BLOCKRADAR_API_KEY="",
    BLOCKRADAR_WALLET_ID="",
    ANTHROPIC_API_KEY="",        # tests must never reach the real API, even if the developer's shell has a key
)

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import data_loader, auth as auth_service
from app.services.blockradar import BlockradarClient
from app.core.state import states

KEY_A = "key-for-workspace-a-0123456789"
KEY_B = "key-for-workspace-b-0123456789"
WALLET_A = "11111111-1111-1111-1111-111111111111"
WALLET_B = "22222222-2222-2222-2222-222222222222"


def _iso(minutes_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


def raw_address(prefix: str, i: int) -> dict:
    return {"id": f"{prefix}-a{i}", "address": f"{prefix}Addr{i}", "name": f"{prefix.upper()} Fintech {i}",
            "createdAt": "2026-01-01T00:00:00Z", "blockchain": {"slug": "solana"}, "metadata": None}


def raw_tx(prefix: str, i: int, n_addr: int, minutes_ago: float, status: str = "SUCCESS") -> dict:
    a = i % n_addr
    return {"id": f"{prefix}-t{i}", "type": "DEPOSIT", "status": status, "amount": "100",
            "asset": {"symbol": "USDC"}, "address": {"id": f"{prefix}-a{a}", "address": f"{prefix}Addr{a}"},
            "createdAt": _iso(minutes_ago)}


def make_dataset(prefix: str, n_addr: int, n_tx=None, order: str = "desc") -> dict:
    """Blockradar-shaped data. Transactions are returned in API order (desc = newest first)."""
    n_tx = n_addr if n_tx is None else n_tx
    txs = [raw_tx(prefix, i, n_addr, minutes_ago=i + 1) for i in range(n_tx)]   # index 0 is the newest
    if order == "asc":
        txs.reverse()
    return {"addresses": [raw_address(prefix, i) for i in range(n_addr)], "txs": txs}


class FakeBlockradar:
    """A stand-in for the Blockradar API, keyed by API key. Counts transaction-page requests."""

    def __init__(self):
        self.fail = False
        self.tx_pages = 0
        self.datasets = {}

    def reset(self):
        self.fail = False
        self.tx_pages = 0
        self.datasets = {KEY_A: make_dataset("a", 3), KEY_B: make_dataset("b", 5)}


def _demo_dataset():
    ds = make_dataset("demo", 7)
    ds["txs"][0]["createdAt"] = "2025-08-01T00:00:00Z"   # one demo fintech went quiet ~200 days before the demo end date (2026-03-01)
    txs = data_loader.normalize_transactions(ds["txs"], {})
    return data_loader.normalize_addresses(ds["addresses"], txs), txs


@pytest.fixture(autouse=True)
def fake(monkeypatch):
    """No network: the Blockradar client and the simulator are replaced with deterministic fakes."""
    f = FakeBlockradar()
    f.reset()

    async def ping(self):
        if f.fail:
            raise RuntimeError("Blockradar is down")
        return self.api_key in f.datasets

    async def get_all_addresses(self):
        return list(f.datasets[self.api_key]["addresses"])

    async def get_transactions(self, page=1, limit=100, status=None):
        f.tx_pages += 1
        txs = f.datasets[self.api_key]["txs"]
        chunk = txs[(page - 1) * limit: page * limit]
        return {"data": chunk, "meta": {"currentPage": page, "totalPages": max(math.ceil(len(txs) / limit), 1), "total": len(txs)}}

    async def get_wallet_balances(self):
        return []

    async def fake_sim():
        return _demo_dataset()

    async def fake_verify(creds):
        from app.services.blockradar import CredentialError
        if creds.api_key not in (KEY_A, KEY_B):
            raise CredentialError("Blockradar rejected this API key for that wallet.")

    monkeypatch.setattr(BlockradarClient, "ping", ping)
    monkeypatch.setattr(BlockradarClient, "get_all_addresses", get_all_addresses)
    monkeypatch.setattr(BlockradarClient, "get_transactions", get_transactions)
    monkeypatch.setattr(BlockradarClient, "get_wallet_balances", get_wallet_balances)
    monkeypatch.setattr(data_loader, "_load_simulated", fake_sim)
    monkeypatch.setattr(data_loader, "MIN_REFRESH_INTERVAL_S", 0)
    import app.api.routes.workspace as ws
    monkeypatch.setattr(ws, "verify_credentials", fake_verify)

    states.clear()
    data_loader._locks.clear()
    auth_service._attempts.clear()
    auth_service._key_attempts.clear()
    yield f


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


def register(client, name="Test User"):
    _counter["n"] += 1
    r = client.post("/auth/register", json={"email": f"user{_counter['n']}@example.com", "password": "password123", "name": name})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def set_plan(client, headers, plan):
    """Put the caller's workspace on a plan (what a Stripe webhook or the admin console does in production)."""
    from app.core.database import SessionLocal
    from app.models.organization import Organization
    org_id = client.get("/workspace", headers=headers).json()["workspace"]["id"]
    with SessionLocal() as db:
        db.query(Organization).filter(Organization.id == org_id).update({"plan": plan})
        db.commit()


class Mailbox(list):
    """Captures outgoing email. `enabled` toggles whether the server believes email is configured."""
    enabled = True
    fail = False          # simulate the provider refusing to deliver


@pytest.fixture()
def mailbox(monkeypatch):
    from app.services import email as mailer
    box = Mailbox()

    async def capture(to, subject, text, html=None):
        if box.fail:
            return False
        box.append({"to": to, "subject": subject, "text": text, "html": html})
        return True

    monkeypatch.setattr(mailer, "send_email", capture)
    monkeypatch.setattr(mailer, "email_enabled", lambda: box.enabled)
    return box

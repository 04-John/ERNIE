import os
import tempfile

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
)

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import data_loader, auth as auth_service
from app.core.state import states


def _dataset(prefix: str, n: int):
    """A tiny normalized dataset: n addresses, each with one successful deposit."""
    raw_addrs = [
        {"id": f"{prefix}-a{i}", "address": f"{prefix}Addr{i}", "name": f"{prefix.upper()} Fintech {i}",
         "createdAt": "2026-01-01T00:00:00Z", "blockchain": {"slug": "solana"}, "metadata": None}
        for i in range(n)
    ]
    raw_txs = [
        {"id": f"{prefix}-t{i}", "type": "DEPOSIT", "status": "SUCCESS", "amount": "100",
         "asset": {"symbol": "USDC"}, "address": {"id": f"{prefix}-a{i}"},
         "createdAt": "2026-10-01T00:00:00Z"}
        for i in range(n)
    ]
    txs = data_loader.normalize_transactions(raw_txs, {})
    return data_loader.normalize_addresses(raw_addrs, txs), txs


KEY_A = "key-for-workspace-a-0123456789"
KEY_B = "key-for-workspace-b-0123456789"
WALLET_A = "11111111-1111-1111-1111-111111111111"
WALLET_B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    """No network: Blockradar and the simulator are replaced with deterministic fakes."""
    calls = {"real_fail": False}

    async def fake_real(creds):
        if calls["real_fail"]:
            raise RuntimeError("Blockradar is down")
        # dataset size depends on which key was used, proving per-workspace credentials are honoured
        return _dataset("a", 3) if creds.api_key == KEY_A else _dataset("b", 5)

    async def fake_sim():
        return _dataset("demo", 7)

    async def fake_verify(creds):
        from app.services.blockradar import CredentialError
        if creds.api_key not in (KEY_A, KEY_B):
            raise CredentialError("Blockradar rejected this API key for that wallet.")

    monkeypatch.setattr(data_loader, "_load_real", fake_real)
    monkeypatch.setattr(data_loader, "_load_simulated", fake_sim)
    monkeypatch.setattr(data_loader, "MIN_REFRESH_INTERVAL_S", 0)
    import app.api.routes.workspace as ws
    monkeypatch.setattr(ws, "verify_credentials", fake_verify)

    states.clear()
    data_loader._locks.clear()
    auth_service._attempts.clear()
    yield calls


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

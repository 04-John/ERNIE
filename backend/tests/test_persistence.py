import time
from datetime import datetime, timedelta

from conftest import register, make_dataset, raw_tx, KEY_A, KEY_B, WALLET_A, WALLET_B
from app.core.database import SessionLocal
from app.core.state import states
from app.models.organization import BlockradarConnection
from app.models.stored import StoredAddress, StoredTransaction, Snapshot
from app.services import sync


def connect(client, h, key=KEY_A, wallet=WALLET_A):
    r = client.put("/workspace/connection", headers=h, json={"api_key": key, "wallet_id": wallet})
    assert r.status_code == 200, r.text
    return r


def org_id(client, h):
    return client.get("/workspace", headers=h).json()["workspace"]["id"]


def counts(org):
    with SessionLocal() as db:
        return (
            db.query(StoredAddress).filter(StoredAddress.org_id == org).count(),
            db.query(StoredTransaction).filter(StoredTransaction.org_id == org).count(),
            db.query(Snapshot).filter(Snapshot.org_id == org).count(),
        )


def wait_for(predicate, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def status(client, h):
    return client.get("/analytics/status", headers=h).json()


def refresh(client, h):
    r = client.post("/analytics/refresh", headers=h)
    assert r.status_code == 200, r.text


def test_sync_persists_addresses_and_transactions(client):
    h = register(client)
    connect(client, h)
    assert counts(org_id(client, h))[:2] == (3, 3)


def test_restart_rebuilds_from_the_database_without_blockradar(client, fake):
    h = register(client)
    connect(client, h)
    states.clear()                       # simulate a process restart
    fake.fail = True                     # ...with Blockradar down

    assert client.get("/analytics/summary", headers=h).json()["data"]["total_wallets"] == 3   # served from the DB
    assert status(client, h)["data_source"] == "real"
    # the background catch-up fails, is reported, and the stored data keeps being served
    assert wait_for(lambda: "Blockradar is down" in (status(client, h)["last_error"] or ""))
    assert client.get("/analytics/summary", headers=h).json()["data"]["total_wallets"] == 3


def test_first_sync_runs_in_the_background_and_reports_syncing(client):
    h = register(client)
    connect(client, h)
    org = org_id(client, h)
    sync.purge_org_data(org)             # as if this wallet had never been synced
    states.clear()

    first = status(client, h)
    assert first["data_source"] in ("syncing", "real")                 # never blocks, never demo data
    assert wait_for(lambda: status(client, h)["data_source"] == "real")
    assert client.get("/analytics/summary", headers=h).json()["data"]["total_wallets"] == 3


def test_incremental_sync_fetches_fewer_pages(client, fake):
    fake.datasets[KEY_A] = make_dataset("a", 3, n_tx=250)              # 3 pages, newest first
    h = register(client)
    connect(client, h)
    assert fake.tx_pages == 3                                          # first sync is a full fetch
    org = org_id(client, h)
    assert counts(org)[1] == 250

    fake.datasets[KEY_A]["txs"].insert(0, raw_tx("a", 999, 3, minutes_ago=0))   # one brand-new transaction
    fake.tx_pages = 0
    refresh(client, h)
    assert fake.tx_pages == 2                                          # page 1 (new) + page 2 (all known) -> stop
    assert counts(org)[1] == 251

    fake.tx_pages = 0
    refresh(client, h)
    assert fake.tx_pages == 1                                          # nothing new: one page


def test_pending_transaction_is_updated_incrementally(client, fake):
    ds = make_dataset("a", 3, n_tx=20)
    ds["txs"][2]["status"] = "PENDING"
    fake.datasets[KEY_A] = ds
    h = register(client)
    connect(client, h)
    org = org_id(client, h)

    ds["txs"][2]["status"] = "SUCCESS"
    refresh(client, h)
    with SessionLocal() as db:
        assert db.query(StoredTransaction).filter_by(org_id=org, id="a-t2").one().status == "SUCCESS"


def test_deeply_buried_pending_is_caught_by_the_daily_full_resync(client, fake):
    ds = make_dataset("a", 3, n_tx=250)
    ds["txs"][200]["status"] = "PENDING"                               # page 3: beyond an incremental sync's reach
    fake.datasets[KEY_A] = ds
    h = register(client)
    connect(client, h)
    org = org_id(client, h)

    ds["txs"][200]["status"] = "SUCCESS"
    refresh(client, h)                                                 # incremental: stops at page 1
    with SessionLocal() as db:
        assert db.query(StoredTransaction).filter_by(org_id=org, id="a-t200").one().status == "PENDING"
        conn = db.query(BlockradarConnection).filter_by(org_id=org).one()
        conn.last_full_sync_at = datetime.utcnow() - timedelta(days=2)  # the daily full re-fetch is now due
        db.commit()
    refresh(client, h)
    with SessionLocal() as db:
        assert db.query(StoredTransaction).filter_by(org_id=org, id="a-t200").one().status == "SUCCESS"


def test_unknown_or_ascending_order_always_does_a_full_fetch(client, fake):
    fake.datasets[KEY_A] = make_dataset("a", 3, n_tx=250, order="asc")
    h = register(client)
    connect(client, h)
    assert fake.tx_pages == 3
    fake.tx_pages = 0
    refresh(client, h)
    assert fake.tx_pages == 3                                          # can't prove newest-first, so no early stop


def test_snapshot_history_one_row_per_day(client):
    h = register(client)
    connect(client, h)
    refresh(client, h)
    refresh(client, h)                                                 # same day: overwritten, not duplicated
    body = client.get("/analytics/history", headers=h).json()
    assert body["demo"] is False and len(body["data"]) == 1
    row = body["data"][0]
    assert row["total_wallets"] == 3 and row["fintechs"] == 3 and row["transactions"] == 3
    assert row["active_wallets"] + row["dormant_wallets"] + row["never_active"] == 3

    demo = register(client)
    assert client.get("/analytics/history", headers=demo).json() == {"data": [], "demo": True}


def test_disconnect_purges_everything_stored(client):
    h = register(client)
    connect(client, h)
    org = org_id(client, h)
    assert counts(org) == (3, 3, 1)
    assert client.delete("/workspace/connection", headers=h).status_code == 200
    assert counts(org) == (0, 0, 0)
    assert client.get("/analytics/history", headers=h).json()["demo"] is True


def test_switching_to_a_different_wallet_never_mixes_histories(client):
    h = register(client)
    connect(client, h, KEY_A, WALLET_A)
    org = org_id(client, h)
    assert counts(org)[:2] == (3, 3)
    connect(client, h, KEY_B, WALLET_B)                                # different wallet id -> old data is purged
    assert counts(org)[:2] == (5, 5)
    assert counts(org)[2] == 1                                         # history restarted for the new wallet


def test_stored_data_is_isolated_even_with_identical_ids(client, fake):
    shared = make_dataset("x", 2)                                      # both workspaces will see the same ids...
    fake.datasets[KEY_A] = shared
    fake.datasets[KEY_B] = make_dataset("x", 4)                        # ...with different contents
    a, b = register(client, "A"), register(client, "B")
    connect(client, a, KEY_A, WALLET_A)
    connect(client, b, KEY_B, WALLET_B)
    assert counts(org_id(client, a))[:2] == (2, 2)
    assert counts(org_id(client, b))[:2] == (4, 4)
    assert client.get("/analytics/summary", headers=a).json()["data"]["total_wallets"] == 2
    assert client.get("/analytics/summary", headers=b).json()["data"]["total_wallets"] == 4


def test_history_truncation_is_reported(client, fake, monkeypatch):
    monkeypatch.setattr(sync, "MAX_PAGES", 1)
    fake.datasets[KEY_A] = make_dataset("a", 3, n_tx=250)
    h = register(client)
    connect(client, h)
    assert status(client, h)["history_truncated"] is True
    assert counts(org_id(client, h))[1] == 100


# ───────────── connecting must answer quickly, and balances must never block or erase data ─────────────

def test_a_slow_sync_does_not_hold_the_connect_request(client, fake, monkeypatch):
    import asyncio
    import time as _t
    from app.services import data_loader
    from app.services.blockradar import BlockradarClient

    async def slow_addresses(self):
        await asyncio.sleep(1.2)                                        # a wallet that takes a while to read
        return list(fake.datasets[self.api_key]["addresses"])

    monkeypatch.setattr(BlockradarClient, "get_all_addresses", slow_addresses)
    monkeypatch.setattr(data_loader, "QUICK_WAIT_S", 0.2)
    h = register(client)

    started = _t.time()
    r = client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A})
    assert r.status_code == 200 and _t.time() - started < 1.0          # answered before the sync finished
    assert r.json()["status"]["data_source"] in ("syncing", "none")
    assert client.get("/workspace", headers=h).json()["connection"]["connected"] is True

    assert wait_for(lambda: status(client, h)["data_source"] == "real", timeout=8)     # ...and it completes by itself
    assert client.get("/analytics/summary", headers=h).json()["data"]["total_wallets"] == 3


def _one_asset(monkeypatch, fake, balance_fn):
    from app.services.blockradar import BlockradarClient

    async def wallet_balances(self):
        return [{"asset": {"id": "asset-1", "asset": {"symbol": "USDC"}}, "balance": "0"}]

    monkeypatch.setattr(BlockradarClient, "get_wallet_balances", wallet_balances)
    monkeypatch.setattr(BlockradarClient, "get_address_balance", balance_fn)


def test_balances_are_fetched_and_stored(client, fake, monkeypatch):
    async def balance(self, address_id, asset_id):
        return {"balance": "42", "convertedBalance": "42.5"}

    _one_asset(monkeypatch, fake, balance)
    h = register(client)
    connect(client, h)
    wallets = client.get("/wallets/activity", headers=h).json()["data"]
    assert sorted(w["balanceUsd"] for w in wallets) == [42.5, 42.5, 42.5]
    with SessionLocal() as db:
        assert {r.balance_symbol for r in db.query(StoredAddress).filter_by(org_id=org_id(client, h))} == {"USDC"}


def test_a_slow_balance_api_neither_blocks_the_sync_nor_erases_stored_balances(client, fake, monkeypatch):
    import asyncio
    from app.services import data_loader

    async def fast(self, address_id, asset_id):
        return {"balance": "10", "convertedBalance": "10"}

    _one_asset(monkeypatch, fake, fast)
    h = register(client)
    connect(client, h)
    org = org_id(client, h)
    assert {w["balanceUsd"] for w in client.get("/wallets/activity", headers=h).json()["data"]} == {10.0}

    async def hangs(self, address_id, asset_id):
        await asyncio.sleep(30)                                         # the balance API stalls

    _one_asset(monkeypatch, fake, hangs)
    monkeypatch.setattr(data_loader, "BALANCE_BUDGET_S", 0.3)
    import time as _t
    started = _t.time()
    refresh(client, h)
    assert _t.time() - started < 5                                      # the sync did not wait for the stalled API
    with SessionLocal() as db:                                          # ...and the last good balances survived
        assert {r.balance_usd for r in db.query(StoredAddress).filter_by(org_id=org)} == {10.0}

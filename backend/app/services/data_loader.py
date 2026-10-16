"""
Data Loader
===========
Turns Blockradar API responses (or the demo simulator) into the internal format,
runs the churn pipeline and stores the result in the per-workspace `states` map.
Used by the request path (lazy load), the scheduler and the manual-refresh endpoint.

Blockradar field mapping (verified against the live API / docs):
  address : id, address, name, type, network, metadata, createdAt, blockchain{slug}
  tx      : id, hash, type (DEPOSIT|WITHDRAW|SALVAGE), status
            (PENDING|SUCCESS|FAILED|CANCELLED), amount (string),
            asset{symbol}, address{id,address}, senderAddress,
            recipientAddress, createdAt
  balance : GET /addresses/{id}/balance?assetId=...  -> {balance, convertedBalance}

Addresses carry no activity or balance fields, so activity is derived from
transactions and balances are fetched per address/asset.

Tenancy: every function that touches data takes a state `key` (an organization id,
or DEMO_KEY for the shared read-only demo dataset). Real workspaces never fall back
to demo data: on a failed sync they keep their last good data and surface the error.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

import pandas as pd

from app.core.config import get_settings
from app.core.state import states, empty_state, DEMO_KEY
from app.services.blockradar import Creds

settings = get_settings()

DORMANT_AFTER_DAYS = 60
MIN_REFRESH_INTERVAL_S = 30
MAX_BALANCE_CALLS = 300
MAX_CONCURRENT_REFRESHES = 3
STABLECOINS = {"USDC", "USDT", "PYUSD", "DAI", "BUSD", "FDUSD", "USDS", "USDE", "TUSD", "USDP"}

REGIONS = {
    "Nigeria": "Africa", "Ghana": "Africa", "Kenya": "Africa",
    "South Africa": "Africa", "Egypt": "Africa", "Senegal": "Africa",
    "Rwanda": "Africa", "Ethiopia": "Africa", "Tanzania": "Africa",
    "Brazil": "LatAm", "Mexico": "LatAm", "Argentina": "LatAm",
    "Colombia": "LatAm", "Chile": "LatAm", "Peru": "LatAm",
    "UAE": "Middle East", "Saudi Arabia": "Middle East",
    "Jordan": "Middle East", "Kuwait": "Middle East",
    "Indonesia": "Southeast Asia", "Philippines": "Southeast Asia",
    "Vietnam": "Southeast Asia", "Thailand": "Southeast Asia",
    "Malaysia": "Southeast Asia", "Singapore": "Southeast Asia",
}

_locks: Dict[str, asyncio.Lock] = {}
_refresh_slots = asyncio.Semaphore(MAX_CONCURRENT_REFRESHES)


def _lock_for(key: str) -> asyncio.Lock:
    return _locks.setdefault(key, asyncio.Lock())


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _to_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


# ─────────────────────────────────────────────
# TRANSACTIONS
# ─────────────────────────────────────────────

def normalize_transactions(raw: list, address_index: Dict[str, str]) -> list:
    """
    address_index maps lower-cased on-chain address -> Blockradar address id,
    used when a transaction only carries address strings.
    SALVAGE rows are internal sweeps, not customer activity, so they are dropped.
    """
    now = datetime.now(timezone.utc)
    out = []

    for tx in raw:
        tx_type = str(tx.get("type") or "").upper()
        if tx_type == "SALVAGE":
            continue

        status = str(tx.get("status") or "").upper()
        if status == "CANCELLED":
            status = "FAILED"
        if status not in ("SUCCESS", "FAILED", "PENDING"):
            status = "PENDING"

        addr_obj = tx.get("address")
        address_id = ""
        if isinstance(addr_obj, dict):
            address_id = addr_obj.get("id") or address_index.get(str(addr_obj.get("address", "")).lower(), "")
        if not address_id:
            for key in ("recipientAddress", "senderAddress"):
                address_id = address_index.get(str(tx.get(key) or "").lower(), "")
                if address_id:
                    break

        asset = tx.get("asset")
        symbol = (asset.get("symbol") if isinstance(asset, dict) else None) or tx.get("currency") or ""
        symbol = str(symbol).upper()
        amount = _to_float(tx.get("amount"))
        # No USD field is returned, so only stablecoins are valued (1:1)
        amount_usd = amount if symbol in STABLECOINS else 0.0

        created = _parse_dt(tx.get("createdAt")) or now
        blockchain = tx.get("blockchain")

        out.append({
            "id": tx.get("id") or str(uuid.uuid4()),
            "hash": tx.get("hash") or "",
            "type": tx_type.lower() or "transfer",
            "status": status,
            "network": (blockchain.get("slug") if isinstance(blockchain, dict) else None) or tx.get("network") or "",
            "currency": symbol,
            "amount": amount,
            "amountUsd": amount_usd,
            "fee": _to_float(tx.get("gasFee")),
            "feeUsd": 0.0,
            "fromAddress": tx.get("senderAddress") or "",
            "toAddress": tx.get("recipientAddress") or "",
            "createdAt": created.isoformat(),
            "_walletId": address_id,
            "_fintechId": address_id,
            "_fintechName": "",
            "_region": "",
        })

    return out


# ─────────────────────────────────────────────
# ADDRESSES
# ─────────────────────────────────────────────

def normalize_addresses(
    raw: list,
    transactions: list,
    balances_usd: Optional[Dict[str, float]] = None,
    balance_symbols: Optional[Dict[str, str]] = None,
) -> list:
    """
    Each Blockradar child address is treated as one fintech customer.
    Optional address `metadata` may carry {region, country, type}; otherwise
    those stay "Unassigned"/"Unknown"/"Unclassified" rather than being invented.
    Activity comes from successful transactions: an address with none is
    `neverActive` (not dormant) so a fresh account doesn't read as 100% dormant.
    """
    balances_usd = balances_usd or {}
    balance_symbols = balance_symbols or {}
    now = datetime.now(timezone.utc)

    stats: Dict[str, dict] = {}
    for tx in transactions:
        if tx["status"] != "SUCCESS" or not tx["_walletId"]:
            continue
        s = stats.setdefault(tx["_walletId"], {"last": None, "count": 0, "recv": 0.0, "sent": 0.0})
        created = _parse_dt(tx["createdAt"])
        if created and (s["last"] is None or created > s["last"]):
            s["last"] = created
        s["count"] += 1
        if tx["type"] == "deposit":
            s["recv"] += tx["amountUsd"]
        elif tx["type"] == "withdraw":
            s["sent"] += tx["amountUsd"]

    # name every transaction after its owning address
    names = {a.get("id"): (a.get("name") or "") for a in raw}
    for tx in transactions:
        tx["_fintechName"] = names.get(tx["_walletId"], "") or "Unknown"

    out = []
    region_by_id: Dict[str, str] = {}
    for addr in raw:
        addr_id = addr.get("id") or str(uuid.uuid4())
        created = _parse_dt(addr.get("createdAt")) or now
        s = stats.get(addr_id)
        last_active = s["last"] if s else None
        never_active = last_active is None

        reference = last_active or created
        days_since = max((now - reference).days, 0)
        is_dormant = (not never_active) and days_since > DORMANT_AFTER_DAYS

        meta = addr.get("metadata") if isinstance(addr.get("metadata"), dict) else {}
        country = meta.get("country") or "Unknown"
        region = meta.get("region") or REGIONS.get(country, "Unassigned")
        ftype = meta.get("type") or "Unclassified"
        name = addr.get("name") or addr.get("label") or "Unnamed address"

        blockchain = addr.get("blockchain")
        network = (blockchain.get("slug") if isinstance(blockchain, dict) else None) or addr.get("network") or ""
        balance = balances_usd.get(addr_id, 0.0)

        region_by_id[addr_id] = region

        out.append({
            "id": addr_id,
            "address": addr.get("address") or "",
            "network": network,
            "currency": balance_symbols.get(addr_id, ""),
            "label": name,
            "balance": balance,
            "balanceUsd": balance,
            "totalReceived": s["recv"] if s else 0.0,
            "totalSent": s["sent"] if s else 0.0,
            "totalTransactions": s["count"] if s else 0,
            "lastActive": last_active.isoformat() if last_active else "",
            "createdAt": created.isoformat(),
            "neverActive": never_active,
            "isDormant": is_dormant,
            # days since last tx, or since creation if the address never transacted
            "daysSinceLastTx": days_since,
            "_fintechId": addr_id,
            "_fintechName": name,
            "_fintechType": ftype,
            "_region": region,
            "_country": country,
        })

    for tx in transactions:
        tx["_region"] = region_by_id.get(tx["_walletId"], "Unassigned")

    return out


# ─────────────────────────────────────────────
# BALANCES
# ─────────────────────────────────────────────

async def fetch_balances(client, addresses_raw: list):
    """Per-address USD balances (best effort). Returns (usd_by_id, top_symbol_by_id)."""
    usd: Dict[str, float] = {}
    symbols: Dict[str, str] = {}
    try:
        wallet_rows = await client.get_wallet_balances()
    except Exception as e:
        print(f"  WARN could not list wallet assets for balances: {type(e).__name__}")
        return usd, symbols
    if isinstance(wallet_rows, dict):
        wallet_rows = wallet_rows.get("data", [])

    assets = []
    for row in wallet_rows or []:
        a = row.get("asset") or {}
        asset_id = a.get("id")
        sym = ((a.get("asset") or {}).get("symbol") or a.get("symbol") or "")
        if asset_id:
            assets.append((asset_id, str(sym).upper()))

    jobs = [(a["id"], aid, sym) for a in addresses_raw if a.get("id") for aid, sym in assets]
    if len(jobs) > MAX_BALANCE_CALLS:
        print(f"  WARN {len(jobs)} balance lookups needed; capping at {MAX_BALANCE_CALLS}")
        jobs = jobs[:MAX_BALANCE_CALLS]

    sem = asyncio.Semaphore(5)
    best: Dict[str, float] = {}

    async def one(addr_id, asset_id, sym):
        async with sem:
            try:
                data = await client.get_address_balance(addr_id, asset_id)
            except Exception:
                return
        converted = _to_float(data.get("convertedBalance"))
        if converted:
            usd[addr_id] = usd.get(addr_id, 0.0) + converted
        raw_bal = _to_float(data.get("balance"))
        if raw_bal > best.get(addr_id, 0.0):
            best[addr_id] = raw_bal
            symbols[addr_id] = sym

    await asyncio.gather(*(one(*j) for j in jobs))
    return usd, symbols


# ─────────────────────────────────────────────
# LOADERS
# ─────────────────────────────────────────────

async def _load_real(creds: Creds):
    from app.services.blockradar import BlockradarClient
    client = BlockradarClient(creds)

    if not await client.ping():
        raise RuntimeError("Blockradar rejected the saved API key or wallet ID")

    addresses_raw = await client.get_all_addresses()
    transactions_raw = await client.get_all_transactions(max_pages=50)
    if not addresses_raw:
        raise RuntimeError("No addresses returned for this wallet")

    address_index = {
        str(a.get("address", "")).lower(): a["id"] for a in addresses_raw if a.get("id") and a.get("address")
    }
    transactions = normalize_transactions(transactions_raw, address_index)
    balances_usd, symbols = await fetch_balances(client, addresses_raw)
    addresses = normalize_addresses(addresses_raw, transactions, balances_usd, symbols)

    print(f"  Normalized: {len(addresses)} addresses, {len(transactions)} transactions")
    return addresses, transactions


async def _load_simulated():
    from app.services.simulator import run_simulation
    raw = await asyncio.to_thread(run_simulation)
    return raw["addresses"], raw["transactions"]


def _empty_results() -> dict:
    from app.services.churn_engine import compute_summary
    return {
        "summary": compute_summary([], [], pd.DataFrame()),
        "churn_scores": [],
        "monthly_volume": [],
        "regional_summary": [],
    }


def _record_sync(key: str, error: Optional[str]) -> None:
    """Persist last sync time / error on the workspace's connection row (best effort)."""
    if key == DEMO_KEY:
        return
    try:
        from app.core.database import SessionLocal
        from app.models.organization import BlockradarConnection
        with SessionLocal() as db:
            conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == key).first()
            if conn:
                conn.last_error = error
                if error is None:
                    conn.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.commit()
    except Exception as e:  # never let bookkeeping break a refresh
        print(f"  WARN could not record sync result: {type(e).__name__}")


async def refresh_state(key: str, creds: Optional[Creds] = None, trigger: str = "scheduler", force: bool = False) -> dict:
    """
    Reload data for one workspace and recompute its results. Serialised per key so
    overlapping refreshes can't interleave; manual triggers are rate limited per key.
    Raises RuntimeError("cooldown") if called again within the cooldown window.
    """
    from app.services.churn_engine import run_churn_pipeline

    state = states.setdefault(key, empty_state())
    lock = _lock_for(key)

    if lock.locked():
        return get_status(key)
    if not force and time.monotonic() - state.get("_last_refresh_mono", -1e9) < MIN_REFRESH_INTERVAL_S:
        raise RuntimeError("cooldown")

    async with lock:
        async with _refresh_slots:
            state["refreshing"] = True
            label = "demo" if key == DEMO_KEY else key[:8]
            print(f"\n[{trigger}] refreshing {label} at {datetime.now(timezone.utc).isoformat()}")
            try:
                simulate = key == DEMO_KEY or settings.data_mode == "simulated"
                error = None
                try:
                    if simulate:
                        addresses, transactions = await _load_simulated()
                        source = "simulated"
                    else:
                        addresses, transactions = await _load_real(creds)
                        source = "real"
                except Exception as e:
                    # Real workspaces never fall back to demo data: keep the last good data and say what failed
                    error = f"{type(e).__name__}: {e}"[:300]
                    print(f"  WARN sync failed for {label}: {error}")
                    if state.get("data_source") in (None, "none", "error"):
                        state.update(_empty_results())
                        state["raw"] = {"addresses": [], "transactions": []}
                        state["data_source"] = "error"
                    state["last_error"] = error
                    state["_last_refresh_mono"] = time.monotonic()
                    _record_sync(key, error)
                    return get_status(key)

                kwargs = {} if simulate else {"as_of": pd.Timestamp.now()}
                results = await asyncio.to_thread(run_churn_pipeline, addresses, transactions, **kwargs)

                state.update(results)
                state["raw"] = {"addresses": addresses, "transactions": transactions}
                state["data_source"] = source
                state["last_error"] = None
                state["last_refreshed"] = datetime.now(timezone.utc).isoformat()
                state["_last_refresh_mono"] = time.monotonic()
                _record_sync(key, None)
                print("  Pipeline complete.")
            finally:
                state["refreshing"] = False
    return get_status(key)


async def ensure_loaded(key: str, creds: Optional[Creds] = None) -> dict:
    """Return the workspace's state, loading it first if this is the first request since startup."""
    state = states.get(key)
    if state and state.get("data_source") not in (None, "none"):
        return state
    lock = _lock_for(key)
    if lock.locked():                      # someone else is loading: wait for them
        async with lock:
            pass
    else:
        await refresh_state(key, creds, "first-load", force=True)
    return states.setdefault(key, empty_state())


async def refresh_all(trigger: str = "scheduler") -> None:
    """Refresh every connected workspace (scheduler). One workspace failing never affects the others."""
    from app.core.database import SessionLocal
    from app.models.organization import BlockradarConnection
    from app.services.tenancy import creds_from_connection

    if settings.data_mode == "simulated":
        return
    with SessionLocal() as db:
        jobs = []
        for conn in db.query(BlockradarConnection).all():
            try:
                jobs.append((conn.org_id, creds_from_connection(conn)))
            except ValueError as e:
                print(f"  WARN {conn.org_id[:8]}: {e}")

    async def one(org_id, creds):
        try:
            await refresh_state(org_id, creds, trigger, force=True)
        except Exception as e:
            print(f"[{trigger}] refresh failed for {org_id[:8]}: {type(e).__name__}")

    await asyncio.gather(*(one(o, c) for o, c in jobs))


def drop_state(key: str) -> None:
    states.pop(key, None)
    _locks.pop(key, None)


def get_status(key: str) -> dict:
    state = states.get(key) or empty_state()
    raw = state.get("raw", {})
    return {
        "data_mode": settings.data_mode,
        "data_source": state.get("data_source", "none"),
        "last_refreshed": state.get("last_refreshed"),
        "last_error": state.get("last_error"),
        "refreshing": bool(state.get("refreshing")),
        "refresh_interval_hours": settings.pipeline_schedule_hours,
        "total_fintechs": len(state.get("churn_scores", [])),
        "total_wallets": state.get("summary", {}).get("total_wallets", 0),
        "total_transactions": len(raw.get("transactions", [])),
    }

"""
Data Loader
===========
Single place that turns Blockradar API responses (or the simulator) into the
internal format, runs the churn pipeline and stores the result in app_state.
Used by startup, the scheduler and the manual-refresh endpoint.

Blockradar field mapping (verified against the live API / docs):
  address : id, address, name, type, network, metadata, createdAt, blockchain{slug}
  tx      : id, hash, type (DEPOSIT|WITHDRAW|SALVAGE), status
            (PENDING|SUCCESS|FAILED|CANCELLED), amount (string),
            asset{symbol}, address{id,address}, senderAddress,
            recipientAddress, createdAt
  balance : GET /addresses/{id}/balance?assetId=...  -> {balance, convertedBalance}

Addresses carry no activity or balance fields, so activity is derived from
transactions and balances are fetched per address/asset.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import pandas as pd

from app.core.config import get_settings
from app.core.state import app_state

settings = get_settings()

DORMANT_AFTER_DAYS = 60
MIN_REFRESH_INTERVAL_S = 30
MAX_BALANCE_CALLS = 300
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

_lock = asyncio.Lock()


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
        print(f"  WARN could not list wallet assets for balances: {e}")
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

async def _load_real():
    from app.services.blockradar import BlockradarClient
    client = BlockradarClient()

    if not await client.ping():
        raise RuntimeError("Blockradar API key or wallet ID rejected")

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


async def refresh_state(trigger: str = "scheduler", force: bool = False) -> dict:
    """
    Reload data and recompute everything in app_state. Serialised by a lock so
    overlapping refreshes can't interleave; manual triggers are rate limited.
    Returns the new status dict. Raises RuntimeError("cooldown") if too soon.
    """
    from app.services.churn_engine import run_churn_pipeline

    if _lock.locked():
        return get_status()
    if not force and time.monotonic() - app_state.get("_last_refresh_mono", -1e9) < MIN_REFRESH_INTERVAL_S:
        raise RuntimeError("cooldown")

    async with _lock:
        app_state["refreshing"] = True
        print(f"\n[{trigger}] refreshing data at {datetime.now(timezone.utc).isoformat()}")
        try:
            source, error = "simulated", None
            if settings.data_mode == "real":
                try:
                    addresses, transactions = await _load_real()
                    source = "real"
                except Exception as e:
                    error = f"{type(e).__name__}: {e}"
                    print(f"  WARN real data fetch failed ({error}); falling back to SIMULATED data")
                    addresses, transactions = await _load_simulated()
                    source = "simulated-fallback"
            else:
                addresses, transactions = await _load_simulated()

            kwargs = {"as_of": pd.Timestamp.now()} if source == "real" else {}
            results = await asyncio.to_thread(run_churn_pipeline, addresses, transactions, **kwargs)

            app_state.update(results)
            app_state["raw"] = {"addresses": addresses, "transactions": transactions}
            app_state["data_source"] = source
            app_state["last_error"] = error
            app_state["last_refreshed"] = datetime.now(timezone.utc).isoformat()
            app_state["_last_refresh_mono"] = time.monotonic()
            print("  Pipeline complete.")
        finally:
            app_state["refreshing"] = False
    return get_status()


def get_status() -> dict:
    raw = app_state.get("raw", {})
    return {
        "data_mode": settings.data_mode,
        "data_source": app_state.get("data_source", "none"),
        "last_refreshed": app_state.get("last_refreshed"),
        "last_error": app_state.get("last_error"),
        "refreshing": bool(app_state.get("refreshing")),
        "refresh_interval_hours": settings.pipeline_schedule_hours,
        "total_fintechs": len(app_state.get("churn_scores", [])),
        "total_wallets": app_state.get("summary", {}).get("total_wallets", 0),
        "total_transactions": len(raw.get("transactions", [])),
    }

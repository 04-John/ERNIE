"""
Sync
====
Durable storage and incremental syncing of a workspace's Blockradar data.

  sync_org()            pull from Blockradar into the database (incremental when safe)
  load_dataset()        read the stored data back as raw API-shaped dicts
  save_snapshot()       record today's headline metrics for trend charts
  load_history()        read snapshots back
  purge_org_data()      delete everything stored for a workspace

Incremental logic never assumes Blockradar's ordering. It inspects page 1 and only
stops early when the list is demonstrably newest-first AND a whole page is already
stored in a final status (SUCCESS/FAILED/CANCELLED). Anything else, a full re-fetch
at least every 24 hours, an unknown ordering, or pending transactions on the page,
keeps paging, so a status change (PENDING -> SUCCESS) is never missed.
"""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from app.core.database import SessionLocal
from app.models.organization import BlockradarConnection
from app.models.stored import StoredAddress, StoredTransaction, Snapshot, FintechDaily
from app.services.blockradar import BlockradarClient, Creds

PAGE_SIZE = 100
MAX_PAGES = 400                       # 40k transactions per workspace before we flag truncation
FULL_RESYNC_AFTER = timedelta(hours=24)
FINAL_STATUSES = {"SUCCESS", "FAILED", "CANCELLED"}
SNAPSHOT_RETENTION_DAYS = 800


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        return None


# ─────────────────────────────────────────────
# TRIMMING (keep only what the pipeline reads)
# ─────────────────────────────────────────────

def slim_address(a: dict) -> dict:
    bc = a.get("blockchain")
    return {
        "id": a.get("id"), "address": a.get("address"), "name": a.get("name"),
        "metadata": a.get("metadata") if isinstance(a.get("metadata"), dict) else None,
        "createdAt": a.get("createdAt"), "network": a.get("network"),
        "blockchain": {"slug": bc.get("slug")} if isinstance(bc, dict) else None,
    }


def slim_tx(t: dict) -> dict:
    addr, asset, bc = t.get("address"), t.get("asset"), t.get("blockchain")
    return {
        "id": t.get("id"), "hash": t.get("hash"), "type": t.get("type"), "status": t.get("status"),
        "amount": t.get("amount"), "gasFee": t.get("gasFee"), "currency": t.get("currency"),
        "createdAt": t.get("createdAt"), "network": t.get("network"),
        "senderAddress": t.get("senderAddress"), "recipientAddress": t.get("recipientAddress"),
        "address": {"id": addr.get("id"), "address": addr.get("address")} if isinstance(addr, dict) else None,
        "asset": {"symbol": asset.get("symbol")} if isinstance(asset, dict) else None,
        "blockchain": {"slug": bc.get("slug")} if isinstance(bc, dict) else None,
    }


# ─────────────────────────────────────────────
# API PAGE HELPERS
# ─────────────────────────────────────────────

def page_items(resp: dict) -> list:
    data = resp.get("data", [])
    if isinstance(data, dict):
        data = data.get("data", [])
    return data or []


def page_total(resp: dict) -> int:
    meta = resp.get("meta") or resp.get("pagination") or {}
    return int(meta.get("totalPages", meta.get("pages", 1)) or 1)


def detect_order(items: list) -> Optional[str]:
    """'desc' (newest first), 'asc', or None when it can't be determined from this page."""
    times = [_parse_dt(i.get("createdAt")) for i in items]
    times = [t for t in times if t]
    if len(times) < 2 or times[0] == times[-1]:
        return None
    return "desc" if times[0] > times[-1] else "asc"


# ─────────────────────────────────────────────
# DB HELPERS (sync; callers run them in threads)
# ─────────────────────────────────────────────

def _upsert_addresses(org_id: str, addresses: List[dict]) -> None:
    with SessionLocal() as db:
        existing = {r.id: r for r in db.query(StoredAddress).filter(StoredAddress.org_id == org_id).all()}
        seen = set()
        for a in addresses:
            if not a.get("id"):
                continue
            seen.add(a["id"])
            payload = json.dumps(slim_address(a))
            row = existing.get(a["id"])
            if row:
                row.data = payload
            else:
                db.add(StoredAddress(org_id=org_id, id=a["id"], data=payload))
        for gone_id, row in existing.items():
            if gone_id not in seen:
                db.delete(row)
        db.commit()


def _set_balances(org_id: str, usd: Dict[str, float], symbols: Dict[str, str]) -> None:
    with SessionLocal() as db:
        for row in db.query(StoredAddress).filter(StoredAddress.org_id == org_id).all():
            row.balance_usd = float(usd.get(row.id, 0.0))
            row.balance_symbol = symbols.get(row.id, "")
        db.commit()


def _known_transactions(org_id: str) -> Dict[str, str]:
    with SessionLocal() as db:
        rows = db.query(StoredTransaction.id, StoredTransaction.status).filter(StoredTransaction.org_id == org_id).all()
    return {r.id: (r.status or "").upper() for r in rows}


def _upsert_transactions(org_id: str, txs: List[dict]) -> Tuple[int, int]:
    """Returns (added, updated)."""
    added = updated = 0
    with SessionLocal() as db:
        ids = [t["id"] for t in txs if t.get("id")]
        existing = {r.id: r for r in db.query(StoredTransaction).filter(
            StoredTransaction.org_id == org_id, StoredTransaction.id.in_(ids)).all()} if ids else {}
        for t in txs:
            if not t.get("id"):
                continue
            payload = json.dumps(slim_tx(t))
            status = str(t.get("status") or "").upper()
            created = _parse_dt(t.get("createdAt"))
            row = existing.get(t["id"])
            if row:
                if row.status != status or row.data != payload:
                    row.status, row.data, row.created_at = status, payload, created
                    updated += 1
            else:
                db.add(StoredTransaction(org_id=org_id, id=t["id"], status=status, created_at=created, data=payload))
                added += 1
        db.commit()
    return added, updated


def _connection_times(org_id: str) -> Optional[datetime]:
    with SessionLocal() as db:
        conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).first()
        return conn.last_full_sync_at if conn else None


def _mark_full_sync(org_id: str) -> None:
    with SessionLocal() as db:
        conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).first()
        if conn:
            conn.last_full_sync_at = _now()
            db.commit()


# ─────────────────────────────────────────────
# SYNC
# ─────────────────────────────────────────────

class SyncReport(dict):
    """added / updated / pages / full / truncated / addresses"""


async def sync_org(org_id: str, creds: Creds, force_full: bool = False) -> SyncReport:
    """Pull the workspace's wallet from Blockradar into the database. Raises if Blockradar can't be reached."""
    import asyncio
    from app.services.data_loader import fetch_balances

    client = BlockradarClient(creds)
    if not await client.ping():
        raise RuntimeError("Blockradar rejected the saved API key or wallet ID")

    addresses = await client.get_all_addresses()
    if not addresses:
        raise RuntimeError("No addresses returned for this wallet")
    await asyncio.to_thread(_upsert_addresses, org_id, addresses)

    known = await asyncio.to_thread(_known_transactions, org_id)
    last_full = await asyncio.to_thread(_connection_times, org_id)
    do_full = force_full or not known or last_full is None or (_now() - last_full) > FULL_RESYNC_AFTER

    added = updated = pages = 0
    truncated = False
    order: Optional[str] = None
    page = 1
    while True:
        if page > MAX_PAGES:
            truncated = True
            break
        resp = await client.get_transactions(page=page, limit=PAGE_SIZE)
        items = page_items(resp)
        pages += 1
        if not items:
            break
        a, u = await asyncio.to_thread(_upsert_transactions, org_id, items)
        added += a
        updated += u
        if page == 1:
            order = detect_order(items)
        # early stop: only when provably newest-first and this whole page was already stored in a final state
        if not do_full and order == "desc" and all(known.get(i.get("id")) in FINAL_STATUSES for i in items):
            break
        if page >= page_total(resp):
            break
        page += 1

    if do_full and not truncated:
        await asyncio.to_thread(_mark_full_sync, org_id)

    usd, symbols = await fetch_balances(client, addresses)
    await asyncio.to_thread(_set_balances, org_id, usd, symbols)

    return SyncReport(added=added, updated=updated, pages=pages, full=do_full, truncated=truncated, addresses=len(addresses))


# ─────────────────────────────────────────────
# READ BACK
# ─────────────────────────────────────────────

def load_dataset(org_id: str) -> Tuple[List[dict], List[dict], Dict[str, float], Dict[str, str]]:
    """Stored data as raw API-shaped dicts: (addresses, transactions, balances_usd, balance_symbols)."""
    with SessionLocal() as db:
        arows = db.query(StoredAddress).filter(StoredAddress.org_id == org_id).all()
        trows = db.query(StoredTransaction).filter(StoredTransaction.org_id == org_id).all()
        addresses = [json.loads(r.data) for r in arows]
        usd = {r.id: r.balance_usd for r in arows}
        symbols = {r.id: r.balance_symbol for r in arows}
        txs = [json.loads(r.data) for r in trows]
    return addresses, txs, usd, symbols


def has_stored_data(org_id: str) -> bool:
    with SessionLocal() as db:
        return db.query(StoredAddress.id).filter(StoredAddress.org_id == org_id).first() is not None


def purge_org_data(org_id: str) -> None:
    with SessionLocal() as db:
        db.query(StoredTransaction).filter(StoredTransaction.org_id == org_id).delete()
        db.query(StoredAddress).filter(StoredAddress.org_id == org_id).delete()
        db.query(Snapshot).filter(Snapshot.org_id == org_id).delete()
        db.query(FintechDaily).filter(FintechDaily.org_id == org_id).delete()
        conn = db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).first()
        if conn:
            conn.last_full_sync_at = None
        db.commit()


# ─────────────────────────────────────────────
# SNAPSHOTS (history)
# ─────────────────────────────────────────────

def save_snapshot(org_id: str, results: dict) -> None:
    """Upsert today's metrics (UTC). Re-syncing the same day overwrites that day's row."""
    s = results.get("summary") or {}
    scores = results.get("churn_scores") or []
    risk = {"High": 0, "Medium": 0, "Low": 0, "Unknown": 0}
    for r in scores:
        risk[r.get("churn_risk", "Unknown")] = risk.get(r.get("churn_risk", "Unknown"), 0) + 1
    total = int(s.get("total_wallets", 0))
    dormant = int(s.get("dormant_wallets", 0))
    never = int(s.get("never_active_wallets", 0))
    today = datetime.now(timezone.utc).date()
    values = dict(
        total_wallets=total, active_wallets=max(total - dormant - never, 0), dormant_wallets=dormant, never_active=never,
        dormancy_rate=float(s.get("dormancy_rate", 0.0)), total_volume_usd=float(s.get("total_volume_usd", 0.0)),
        transactions=int(s.get("total_transactions", 0)), fintechs=int(s.get("total_fintechs", 0)),
        high_risk=risk["High"], medium_risk=risk["Medium"], low_risk=risk["Low"], unscored=risk["Unknown"],
    )
    with SessionLocal() as db:
        row = db.query(Snapshot).filter(Snapshot.org_id == org_id, Snapshot.day == today).first()
        if row:
            for k, v in values.items():
                setattr(row, k, v)
        else:
            db.add(Snapshot(org_id=org_id, day=today, **values))
        cutoff = today - timedelta(days=SNAPSHOT_RETENTION_DAYS)
        db.query(Snapshot).filter(Snapshot.org_id == org_id, Snapshot.day < cutoff).delete()
        db.commit()


def load_history(org_id: str, days: int = 90) -> List[dict]:
    since = datetime.now(timezone.utc).date() - timedelta(days=days)
    with SessionLocal() as db:
        rows = db.query(Snapshot).filter(Snapshot.org_id == org_id, Snapshot.day >= since).order_by(Snapshot.day).all()
        return [{
            "day": r.day.isoformat(), "total_wallets": r.total_wallets, "active_wallets": r.active_wallets,
            "dormant_wallets": r.dormant_wallets, "never_active": r.never_active, "dormancy_rate": r.dormancy_rate,
            "total_volume_usd": r.total_volume_usd, "transactions": r.transactions, "fintechs": r.fintechs,
            "high_risk": r.high_risk, "medium_risk": r.medium_risk, "low_risk": r.low_risk, "unscored": r.unscored,
        } for r in rows]


def save_fintech_daily(org_id: str, results: dict) -> None:
    """Record today's risk + metrics for every fintech (replaces today's rows if re-synced)."""
    scores = results.get("churn_scores") or []
    today = datetime.now(timezone.utc).date()
    with SessionLocal() as db:
        db.query(FintechDaily).filter(FintechDaily.org_id == org_id, FintechDaily.day == today).delete()
        db.add_all([
            FintechDaily(
                org_id=org_id, fintech_id=r["fintech_id"], day=today, fintech_name=r.get("fintech_name") or "",
                risk=r.get("churn_risk", "Unknown"), probability=float(r.get("churn_probability") or 0.0),
                total_volume_usd=float(r.get("total_volume") or 0.0), transactions=int(r.get("total_tx") or 0),
                days_since_last_tx=int(r.get("days_since_last_tx") or 0),
            ) for r in scores
        ])
        db.query(FintechDaily).filter(FintechDaily.org_id == org_id,
                                      FintechDaily.day < today - timedelta(days=SNAPSHOT_RETENTION_DAYS)).delete()
        db.commit()


def load_fintech_history(org_id: str, fintech_id: str, days: int = 120) -> List[dict]:
    since = datetime.now(timezone.utc).date() - timedelta(days=days)
    with SessionLocal() as db:
        rows = (db.query(FintechDaily)
                .filter(FintechDaily.org_id == org_id, FintechDaily.fintech_id == fintech_id, FintechDaily.day >= since)
                .order_by(FintechDaily.day).all())
        return [{"day": r.day.isoformat(), "risk": r.risk, "probability": r.probability,
                 "volume": r.total_volume_usd, "transactions": r.transactions, "days_since_last_tx": r.days_since_last_tx} for r in rows]

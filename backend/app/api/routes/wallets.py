from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.api.deps import OrgCtx, org_ctx
import pandas as pd

router = APIRouter()


@router.get("/dormancy")
async def get_dormancy(
    ctx: OrgCtx = Depends(org_ctx),
    region: Optional[str] = Query(default=None),
):
    """Dormancy stats — overall and per region."""
    raw = ctx.state.get("raw", {})
    addresses = raw.get("addresses", [])
    if not addresses:
        return {"data": {}}

    df = pd.DataFrame(addresses)

    if region:
        df = df[df["_region"].str.lower() == region.lower()]

    if "neverActive" not in df.columns:
        df["neverActive"] = False

    total = len(df)
    dormant = int(df["isDormant"].sum())
    never_active = int(df["neverActive"].sum())
    active = total - dormant - never_active

    by_region = (
        df.groupby("_region")
        .agg(
            total=("id", "count"),
            dormant=("isDormant", "sum"),
            never_active=("neverActive", "sum"),
        )
        .reset_index()
    )
    by_region["dormancy_rate"] = (by_region["dormant"] / by_region["total"]).round(4)
    by_region["activation_rate"] = (
        (by_region["total"] - by_region["dormant"] - by_region["never_active"]) / by_region["total"]
    ).round(4)

    return {
        "data": {
            "overall": {
                "total_wallets": total,
                "active_wallets": active,
                "dormant_wallets": dormant,
                "never_active_wallets": never_active,
                "dormancy_rate": round(dormant / max(total, 1), 4),
                "activation_rate": round(active / max(total, 1), 4),
            },
            "by_region": by_region.rename(
                columns={"_region": "region"}
            ).to_dict(orient="records"),
        }
    }


@router.get("/activity")
async def get_wallet_activity(
    ctx: OrgCtx = Depends(org_ctx),
    fintech_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|dormant|never)$", description="Filter by wallet status"),
    limit: int = Query(default=100, ge=1, le=1000),
):
    """Raw wallet activity — filterable by fintech and by status (active, dormant, never active)."""
    raw = ctx.state.get("raw", {})
    addresses = raw.get("addresses", [])
    if not addresses:
        return {"data": []}

    df = pd.DataFrame(addresses)

    if fintech_id:
        df = df[df["_fintechId"] == fintech_id]

    if status:
        never = df["neverActive"].fillna(False).astype(bool) if "neverActive" in df.columns else pd.Series(False, index=df.index)
        dormant = df["isDormant"].fillna(False).astype(bool) & ~never
        df = df[never] if status == "never" else df[dormant] if status == "dormant" else df[~never & ~dormant]

    cols = [
        "id", "_fintechId", "_fintechName", "_region", "_country",
        "currency", "network", "balanceUsd", "totalTransactions",
        "lastActive", "createdAt", "isDormant", "neverActive", "daysSinceLastTx",
    ]
    available = [c for c in cols if c in df.columns]

    result = df[available].head(limit).to_dict(orient="records")
    return {"total": len(df), "returned": len(result), "data": result}


@router.get("/activity-trend")
async def get_activity_trend(
    ctx: OrgCtx = Depends(org_ctx),
    days: int = Query(default=14, ge=1, le=90),
):
    """
    Successful transactions and distinct active wallets per day (UTC) over the
    last `days` days. In simulated data the window ends at the last transaction
    date, since simulated history stops in the past.
    """
    raw = ctx.state.get("raw", {})
    txs = raw.get("transactions", [])
    if not txs:
        return {"data": []}

    df = pd.DataFrame(txs)
    df = df[df["status"] == "SUCCESS"].copy()
    if df.empty:
        return {"data": []}
    df["ts"] = pd.to_datetime(df["createdAt"], errors="coerce", utc=True)
    df = df.dropna(subset=["ts"])
    if df.empty:
        return {"data": []}

    live = ctx.state.get("data_source") == "real"
    end = pd.Timestamp.now(tz="UTC") if live else df["ts"].max()
    end_day = end.normalize()
    idx = pd.date_range(end=end_day, periods=days, freq="D")

    wallet_col = "_walletId" if "_walletId" in df.columns else "_fintechId"
    df["day"] = df["ts"].dt.normalize()
    grouped = df.groupby("day").agg(
        transactions=("id", "count"),
        active_wallets=(wallet_col, "nunique"),
    )
    grouped = grouped.reindex(idx, fill_value=0)
    return {
        "data": [
            {"day": d.strftime("%b %d"), "transactions": int(r.transactions), "active_wallets": int(r.active_wallets)}
            for d, r in grouped.iterrows()
        ]
    }

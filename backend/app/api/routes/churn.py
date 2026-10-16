from fastapi import APIRouter, Depends, HTTPException, Query
import asyncio
from typing import Optional
from app.api.deps import OrgCtx, org_ctx
from app.core.state import DEMO_KEY
from app.services.sync import load_fintech_history
import pandas as pd

router = APIRouter()


@router.get("/scores")
async def get_churn_scores(
    ctx: OrgCtx = Depends(org_ctx),
    limit: int = Query(default=30, ge=1, le=200),
    risk: Optional[str] = Query(default=None, description="Filter: High, Medium, Low"),
    region: Optional[str] = Query(default=None),
):
    """
    Churn probability scores for all fintechs.
    Sorted by churn_probability descending.
    """
    scores = ctx.state.get("churn_scores", [])
    if not scores:
        return {"data": []}

    df = pd.DataFrame(scores).drop(columns=["breakdown"], errors="ignore")

    # filters
    if risk:
        df = df[df["churn_risk"] == risk]
    if region:
        df = df[df["region"].str.lower() == region.lower()]

    # clean up for JSON
    df["churn_probability"] = df["churn_probability"].round(4)
    df["dormancy_rate"] = df["dormancy_rate"].round(4)

    result = df.head(limit).to_dict(orient="records")
    return {
        "total": len(df),
        "returned": len(result),
        "data": result,
    }


@router.get("/high-risk")
async def get_high_risk(ctx: OrgCtx = Depends(org_ctx)):
    """Shortcut — returns only High risk fintechs."""
    scores = ctx.state.get("churn_scores", [])
    if not scores:
        return {"data": []}

    df = pd.DataFrame(scores).drop(columns=["breakdown"], errors="ignore")
    high = df[df["churn_risk"] == "High"].copy()
    high["churn_probability"] = high["churn_probability"].round(4)

    return {
        "count": len(high),
        "data": high.to_dict(orient="records"),
    }


@router.get("/distribution")
async def get_risk_distribution(ctx: OrgCtx = Depends(org_ctx)):
    """Count of fintechs per risk tier."""
    scores = ctx.state.get("churn_scores", [])
    if not scores:
        return {"data": {}}

    df = pd.DataFrame(scores)
    dist = df["churn_risk"].value_counts().to_dict()

    return {
        "data": {
            "High": dist.get("High", 0),
            "Medium": dist.get("Medium", 0),
            "Low": dist.get("Low", 0),
            "Unknown": dist.get("Unknown", 0),
        }
    }


def _weekly_activity(txs: list, live: bool, weeks: int = 26) -> list:
    """Volume and transaction count per week (Monday start) for the last `weeks` weeks."""
    ok = [t for t in txs if t.get("status") == "SUCCESS"]
    end = pd.Timestamp.now(tz="UTC").tz_convert(None) if live else None
    if ok:
        ts = pd.to_datetime(pd.Series([t["createdAt"] for t in ok]), errors="coerce", utc=True).dt.tz_convert(None)
        df = pd.DataFrame({"ts": ts, "usd": [float(t.get("amountUsd") or 0) for t in ok]}).dropna(subset=["ts"])
    else:
        df = pd.DataFrame({"ts": [], "usd": []})
    if end is None:
        end = df["ts"].max() if not df.empty else pd.Timestamp.now()
    end_week = (end - pd.to_timedelta(end.weekday(), unit="D")).normalize()
    index = pd.date_range(end=end_week, periods=weeks, freq="7D")
    if not df.empty:
        df["week"] = (df["ts"] - pd.to_timedelta(df["ts"].dt.weekday, unit="D")).dt.normalize()
        grouped = df.groupby("week").agg(volume=("usd", "sum"), transactions=("usd", "count"))
    else:
        grouped = pd.DataFrame({"volume": [], "transactions": []})
    grouped = grouped.reindex(index, fill_value=0)
    return [{"week": d.strftime("%b %d"), "volume": round(float(r.volume), 2), "transactions": int(r.transactions)}
            for d, r in grouped.iterrows()]


@router.get("/fintech/{fintech_id}")
async def fintech_detail(fintech_id: str, ctx: OrgCtx = Depends(org_ctx)):
    """Everything about one fintech: score + why, its wallets, recent activity and risk history."""
    row = next((r for r in ctx.state.get("churn_scores", []) if r["fintech_id"] == fintech_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Fintech not found.")

    raw = ctx.state.get("raw", {})
    wallets = [a for a in raw.get("addresses", []) if a.get("_fintechId") == fintech_id]
    txs = [t for t in raw.get("transactions", []) if t.get("_fintechId") == fintech_id]
    recent = sorted(txs, key=lambda t: str(t.get("createdAt", "")), reverse=True)[:15]
    live = ctx.state.get("data_source") == "real"

    history = [] if ctx.key == DEMO_KEY else await asyncio.to_thread(load_fintech_history, ctx.key, fintech_id, 120)

    return {
        "fintech": row,
        "wallets": [{k: w.get(k) for k in ("id", "label", "network", "balanceUsd", "lastActive", "createdAt", "neverActive",
                                           "isDormant", "totalTransactions", "daysSinceLastTx")} for w in wallets[:50]],
        "wallet_count": len(wallets),
        "activity": await asyncio.to_thread(_weekly_activity, txs, live),
        "recent_transactions": [{
            "id": t.get("id"), "type": t.get("type"), "status": t.get("status"), "currency": t.get("currency"),
            "amount": t.get("amount"), "amountUsd": t.get("amountUsd"), "createdAt": t.get("createdAt"),
            "hash": (t["hash"][:10] + "…" + t["hash"][-4:]) if t.get("hash") else "",
        } for t in recent],
        "history": history,
        "demo": ctx.key == DEMO_KEY,
    }

from fastapi import APIRouter, Depends, HTTPException
import pandas as pd

from app.api.deps import OrgCtx, org_ctx
from app.core.state import DEMO_KEY
from app.services.data_loader import get_status as pipeline_status, refresh_state

router = APIRouter()


@router.get("/summary")
async def get_summary(ctx: OrgCtx = Depends(org_ctx)):
    """Top-level KPIs — total wallets, volume, dormancy rate, churn counts."""
    return {"data": ctx.state.get("summary", {})}


@router.get("/monthly-volume")
async def get_monthly_volume(ctx: OrgCtx = Depends(org_ctx)):
    """Monthly transaction volume by region — for the line chart."""
    return {"data": ctx.state.get("monthly_volume", [])}


@router.get("/regional")
async def get_regional_summary(ctx: OrgCtx = Depends(org_ctx)):
    """Per-region aggregates — wallets, activation rate, churn risk, volume."""
    return {"data": ctx.state.get("regional_summary", [])}


@router.get("/type-breakdown")
async def get_type_breakdown(ctx: OrgCtx = Depends(org_ctx)):
    """Average volume and high-risk count by fintech type."""
    scores = ctx.state.get("churn_scores", [])
    if not scores:
        return {"data": []}

    df = pd.DataFrame(scores)

    if "type" not in df.columns or df["type"].isna().all():
        return {"data": []}

    breakdown = (
        df.groupby("type")
        .agg(
            count=("fintech_id", "count"),
            avg_volume=("total_volume", "mean"),
            high_risk=("churn_risk", lambda x: (x == "High").sum()),
        )
        .reset_index()
    )
    breakdown["avg_volume_k"] = (breakdown["avg_volume"] / 1000).round(1)
    return {"data": breakdown.to_dict(orient="records")}


@router.get("/status")
async def get_status(ctx: OrgCtx = Depends(org_ctx)):
    """Pipeline status for the caller's workspace: data source, last refresh, any sync error."""
    return {**pipeline_status(ctx.key), "connected": ctx.connected}


@router.post("/refresh")
async def refresh(ctx: OrgCtx = Depends(org_ctx)):
    """Re-sync the caller's Blockradar wallet and recompute. Rate limited to one run per 30s."""
    if ctx.key == DEMO_KEY:
        # shared, static demo data: nothing to re-sync
        return {**pipeline_status(ctx.key), "connected": False}
    try:
        status = await refresh_state(ctx.key, ctx.creds, "manual")
    except RuntimeError:
        raise HTTPException(status_code=429, detail="Data was refreshed moments ago. Try again in a few seconds.")
    return {**status, "connected": True}

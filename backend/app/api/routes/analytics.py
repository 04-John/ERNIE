from fastapi import APIRouter, HTTPException
from app.core.state import app_state
import pandas as pd

router = APIRouter()


@router.get("/summary")
async def get_summary():
    """Top-level KPIs — total wallets, volume, dormancy rate, churn counts."""
    return {"data": app_state.get("summary", {})}


@router.get("/monthly-volume")
async def get_monthly_volume():
    """Monthly transaction volume by region — for the line chart."""
    return {"data": app_state.get("monthly_volume", [])}


@router.get("/regional")
async def get_regional_summary():
    """Per-region aggregates — wallets, activation rate, churn risk, volume."""
    return {"data": app_state.get("regional_summary", [])}


@router.get("/type-breakdown")
async def get_type_breakdown():
    """Average volume and high-risk count by fintech type."""
    scores = app_state.get("churn_scores", [])
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
async def get_status():
    """Pipeline status: data source, last refresh time, any fetch error."""
    from app.services.data_loader import get_status as status
    return status()


@router.post("/refresh")
async def refresh():
    """Re-fetch from Blockradar and recompute. Rate limited to one run per 30s."""
    from app.services.data_loader import refresh_state
    try:
        return await refresh_state("manual")
    except RuntimeError:
        raise HTTPException(status_code=429, detail="Data was refreshed moments ago. Try again in a few seconds.")

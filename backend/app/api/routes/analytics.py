from fastapi import APIRouter
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
    """Pipeline status — last refresh time and data mode."""
    from app.core.config import get_settings
    settings = get_settings()
    return {
        "data_mode":      settings.data_mode,
        "last_refreshed": app_state.get("last_refreshed", "Not yet"),
        "total_fintechs": len(app_state.get("churn_scores", [])),
        "total_wallets":  app_state.get("summary", {}).get("total_wallets", 0),
    }
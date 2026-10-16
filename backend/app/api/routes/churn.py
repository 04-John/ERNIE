from fastapi import APIRouter, Query
from typing import Optional
from app.core.state import app_state
import pandas as pd

router = APIRouter()


@router.get("/scores")
async def get_churn_scores(
    limit: int = Query(default=30, ge=1, le=200),
    risk: Optional[str] = Query(default=None, description="Filter: High, Medium, Low"),
    region: Optional[str] = Query(default=None),
):
    """
    Churn probability scores for all fintechs.
    Sorted by churn_probability descending.
    """
    scores = app_state.get("churn_scores", [])
    if not scores:
        return {"data": []}

    df = pd.DataFrame(scores)

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
async def get_high_risk():
    """Shortcut — returns only High risk fintechs."""
    scores = app_state.get("churn_scores", [])
    if not scores:
        return {"data": []}

    df = pd.DataFrame(scores)
    high = df[df["churn_risk"] == "High"].copy()
    high["churn_probability"] = high["churn_probability"].round(4)

    return {
        "count": len(high),
        "data": high.to_dict(orient="records"),
    }


@router.get("/distribution")
async def get_risk_distribution():
    """Count of fintechs per risk tier."""
    scores = app_state.get("churn_scores", [])
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
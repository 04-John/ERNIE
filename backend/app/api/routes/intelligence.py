"""
Intelligence Routes
===================
GET  /intelligence/insights          prioritised findings (with evidence and a recommended action)
POST /intelligence/insights/dismiss  hide a finding until the situation changes
POST /intelligence/insights/restore  bring back everything that was dismissed
GET  /intelligence/forecast          30-day volume forecast (+ anomalies)
GET  /intelligence/cohorts           wallet activation / retention by creation month
GET  /intelligence/health            0-100 retention health score and its components
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import OrgCtx, org_ctx
from app.core.state import DEMO_KEY
from app.services import sync

router = APIRouter()


class DismissRequest(BaseModel):
    key: str = Field(max_length=200)


@router.get("/insights")
async def get_insights(ctx: OrgCtx = Depends(org_ctx)):
    if ctx.key == DEMO_KEY:
        return {"data": [{**i, "dismissable": False} for i in ctx.state.get("insights", [])], "demo": True, "dismissed": 0}
    data, dismissed = await asyncio.gather(asyncio.to_thread(sync.load_active_insights, ctx.key), asyncio.to_thread(sync.count_dismissed, ctx.key))
    return {"data": data, "demo": False, "dismissed": dismissed}


@router.post("/insights/dismiss")
async def dismiss(req: DismissRequest, ctx: OrgCtx = Depends(org_ctx)):
    if ctx.key == DEMO_KEY:
        raise HTTPException(status_code=400, detail="Demo insights can't be dismissed. Connect your wallet to manage your own.")
    if not await asyncio.to_thread(sync.dismiss_insight, ctx.key, req.key):
        raise HTTPException(status_code=404, detail="Insight not found.")
    return {"dismissed": True}


@router.post("/insights/restore")
async def restore(ctx: OrgCtx = Depends(org_ctx)):
    if ctx.key == DEMO_KEY:
        raise HTTPException(status_code=400, detail="Demo insights can't be dismissed, so there is nothing to bring back.")
    return {"restored": await asyncio.to_thread(sync.restore_dismissed, ctx.key)}


@router.get("/forecast")
async def get_forecast(ctx: OrgCtx = Depends(org_ctx)):
    return {"forecast": ctx.state.get("forecast"), "anomalies": ctx.state.get("anomalies", [])}


@router.get("/cohorts")
async def get_cohorts(ctx: OrgCtx = Depends(org_ctx)):
    return {"data": ctx.state.get("cohorts", [])}


@router.get("/health")
async def get_health(ctx: OrgCtx = Depends(org_ctx)):
    return ctx.state.get("health") or {"score": None, "grade": None, "components": []}

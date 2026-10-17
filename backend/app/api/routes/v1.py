"""
Public API v1 (authenticated with an API key, billed per call)
==============================================================
GET /v1/health               retention health score and its parts
GET /v1/insights             current findings with a suggested next step
GET /v1/fintechs             your fintechs ranked by churn risk (filter, paginate)
GET /v1/fintechs/{id}        one fintech: score, risk, and the reasons behind it
GET /v1/history?days=        daily headline metrics for charts
GET /v1/usage                your balance and prices (always free)
GET /v1/pricing              the price list. Public: no key needed (the marketing site reads it)

Authentication: `Authorization: Bearer ernie_live_...` (your data, billed) or `ernie_test_...` (demo data, free).
Every billed response carries X-Credits-Charged and X-Credits-Remaining. Errors are never billed.
"""

import asyncio
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import load_workspace
from app.core.database import get_db
from app.core.state import DEMO_KEY
from app.models.apiaccess import ApiKey
from app.models.organization import Organization
from app.services import apiaccess, plans
from app.services.auth import rate_limit_key
from app.services.sync import load_history

router = APIRouter()


@dataclass
class ApiCtx:
    key: ApiKey
    org: Organization
    state: dict
    workspace_key: str
    db: Session

    @property
    def test(self) -> bool:
        return self.key.mode == "test"


def _unauthorized(detail: str = "Missing or invalid API key.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


async def api_ctx(request: Request, db: Session = Depends(get_db)) -> ApiCtx:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else None
    key = apiaccess.authenticate(db, token)
    if key is None:
        raise _unauthorized()

    limit = apiaccess.RATE_LIMITS_PER_MINUTE.get(key.mode, 30)
    if not rate_limit_key(f"api:{key.id}", limit, 60):
        raise HTTPException(status_code=429, detail=f"Rate limit reached ({limit} requests a minute for this key).", headers={"Retry-After": "30"})

    org = db.query(Organization).filter(Organization.id == key.org_id).first()
    if org is None:
        raise _unauthorized()

    if key.mode == "test":
        ctx = await load_workspace(db, "", "member")                      # demo dataset: never your real data, never billed
        workspace_key = DEMO_KEY
    else:
        ctx = await load_workspace(db, org.id, "member")
        if not ctx.connected:
            raise HTTPException(status_code=409, detail="Connect your Blockradar wallet in ERNIE first, or use a test key to try the API on demo data.")
        if ctx.state.get("data_source") in ("syncing", "none", None):
            raise HTTPException(status_code=503, detail="Your data is still syncing. Try again in a minute.", headers={"Retry-After": "30"})
        workspace_key = org.id
    apiaccess.touch(db, key)
    return ApiCtx(key=key, org=org, state=ctx.state, workspace_key=workspace_key, db=db)


def finish(ctx: ApiCtx, endpoint: str, payload: dict) -> JSONResponse:
    """Bill the call (live keys only), then return it. Insufficient credit is a 402 and the data is not sent."""
    cost = apiaccess.ENDPOINT_COSTS[endpoint]
    if ctx.test:
        apiaccess.count_free_call(ctx.db, ctx.org.id, f"test:{endpoint}")
        headers = {"X-ERNIE-Mode": "test", "X-Credits-Charged": "0"}
    else:
        remaining = apiaccess.spend(ctx.db, ctx.org.id, cost, endpoint)
        if remaining is None:
            raise HTTPException(status_code=402, detail=f"Not enough API credits: this call costs {cost}. Top up in ERNIE under Developers.",
                                headers={"X-Credits-Required": str(cost), "X-Credits-Remaining": str(apiaccess.balance(ctx.db, ctx.org.id))})
        headers = {"X-ERNIE-Mode": "live", "X-Credits-Charged": str(cost), "X-Credits-Remaining": str(remaining)}
    return JSONResponse(payload, headers=headers)


def public_fintech(row: dict, detail: bool = False) -> dict:
    out = {
        "id": row["fintech_id"], "name": row["fintech_name"], "region": row.get("region"), "type": row.get("type"),
        "risk": row["churn_risk"], "risk_probability": round(float(row.get("churn_probability") or 0.0), 4),
        "days_since_last_transaction": round(float(row.get("days_since_last_tx") or 0)),
        "transactions": int(row.get("total_tx") or 0),
        "total_volume_usd": round(float(row.get("total_volume") or 0.0), 2),
        "volume_last_3_months_usd": round(float(row.get("vol_recent_3m") or 0.0), 2),
        "volume_previous_3_months_usd": round(float(row.get("vol_prior_3m") or 0.0), 2),
        "dormant_wallet_share": round(float(row.get("dormancy_rate") or 0.0), 4),
    }
    if detail:
        out["score_breakdown"] = [{"signal": b.get("label"), "weight": b.get("weight"), "contribution": b.get("points"), "detail": b.get("detail")}
                                  for b in (row.get("breakdown") or [])]
    return out


@router.get("/pricing")
async def pricing():
    """The public price list, so the website and the server can never disagree."""
    return apiaccess.public_pricing()


@router.get("/usage")
async def usage(ctx: ApiCtx = Depends(api_ctx)):
    """Free. Your key's mode, your credit balance and the price list."""
    return {"mode": ctx.key.mode, "credits_remaining": apiaccess.balance(ctx.db, ctx.org.id), "pricing": apiaccess.public_pricing()}


@router.get("/health")
async def health(ctx: ApiCtx = Depends(api_ctx)):
    h = ctx.state.get("health") or {}
    return finish(ctx, "health", {"score": h.get("score"), "grade": h.get("grade"), "volume_change_28d": h.get("volume_change"),
                                  "components": [{"name": c.get("label"), "value": c.get("value"), "detail": c.get("detail")} for c in h.get("components", [])]})


@router.get("/insights")
async def insights(ctx: ApiCtx = Depends(api_ctx)):
    items = ctx.state.get("insights") or []
    return finish(ctx, "insights", {"data": [{"severity": i.get("severity"), "kind": i.get("kind"), "title": i.get("title"), "detail": i.get("detail"),
                                              "suggested_next_step": i.get("action"), "fintech_ids": i.get("fintech_ids", [])} for i in items]})


@router.get("/fintechs")
async def fintechs(ctx: ApiCtx = Depends(api_ctx), risk: Optional[str] = Query(default=None, pattern="^(High|Medium|Low|Unknown)$"),
                   region: Optional[str] = Query(default=None, max_length=60),
                   limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0, le=100_000)):
    rows = sorted(ctx.state.get("churn_scores") or [], key=lambda r: -float(r.get("churn_probability") or 0.0))
    if risk:
        rows = [r for r in rows if r.get("churn_risk") == risk]
    if region:
        rows = [r for r in rows if str(r.get("region", "")).lower() == region.lower()]
    page = rows[offset:offset + limit]
    return finish(ctx, "fintechs.list", {"total": len(rows), "limit": limit, "offset": offset, "data": [public_fintech(r) for r in page]})


@router.get("/fintechs/{fintech_id}")
async def fintech(fintech_id: str, ctx: ApiCtx = Depends(api_ctx)):
    row = next((r for r in ctx.state.get("churn_scores") or [] if r.get("fintech_id") == fintech_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Fintech not found.")           # raised before billing: not found is free
    return finish(ctx, "fintechs.get", public_fintech(row, detail=True))


@router.get("/history")
async def history(ctx: ApiCtx = Depends(api_ctx), days: int = Query(default=30, ge=1, le=800)):
    if ctx.test:
        data = []                                                                    # the demo dataset has no stored history
    else:
        days = plans.clamp_history(ctx.org, days)
        data = await asyncio.to_thread(load_history, ctx.workspace_key, days)
    return finish(ctx, "history", {"days": days, "data": data})

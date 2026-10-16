"""
Plans and limits: the single place that says what each plan includes.

Prices and limits are product decisions, so they live here as plain data. Change a number, deploy, and
every check in the app follows. A limit of None means unlimited.
"""

from typing import Optional

from fastapi import HTTPException

from app.core.config import get_settings

settings = get_settings()

DEFAULT_PLAN = "free"

PLANS = {
    "free": {
        "name": "Free", "price_usd": 0, "tagline": "Try ERNIE on one wallet.",
        "limits": {"members": 2, "alert_channels": 1, "ai_messages": 10, "history_days": 30},
        "features": ["Risk scoring with reasons", "Insights and health score", "Email, Slack and webhook alerts (1 channel)", "30 days of history"],
    },
    "pro": {
        "name": "Pro", "price_usd": 49, "tagline": "For teams who watch retention weekly.",
        "limits": {"members": 10, "alert_channels": 5, "ai_messages": 300, "history_days": 365},
        "features": ["Everything in Free", "10 team members", "5 alert channels", "300 Ask ERNIE messages a month", "1 year of history"],
    },
    "business": {
        "name": "Business", "price_usd": 199, "tagline": "For larger teams and heavier use.",
        "limits": {"members": 50, "alert_channels": 10, "ai_messages": 2000, "history_days": 800},
        "features": ["Everything in Pro", "50 team members", "10 alert channels", "2,000 Ask ERNIE messages a month", "Full history", "Priority support"],
    },
}

LABELS = {"members": "team members", "alert_channels": "alert channels", "ai_messages": "AI messages this month"}


def plan_id(org) -> str:
    pid = getattr(org, "plan", None) or DEFAULT_PLAN
    return pid if pid in PLANS else DEFAULT_PLAN


def limit(org, key: str) -> Optional[int]:
    """The effective limit for this workspace. An operator override (AI_MONTHLY_LIMIT > 0) beats the plan."""
    if key == "ai_messages" and settings.ai_monthly_limit > 0:
        return settings.ai_monthly_limit
    return PLANS[plan_id(org)]["limits"][key]


def check(org, key: str, current: int) -> None:
    """Raise 402 if adding one more would exceed the plan. 402 tells the UI to offer an upgrade."""
    cap = limit(org, key)
    if cap is not None and current >= cap:
        raise HTTPException(status_code=402, detail=f"Your {PLANS[plan_id(org)]['name']} plan includes {cap} {LABELS[key]}. Upgrade to add more.")


def clamp_history(org, days: int) -> int:
    cap = limit(org, "history_days")
    return days if cap is None else min(days, cap)


def public_plans() -> list:
    return [{"id": k, **{f: v[f] for f in ("name", "price_usd", "tagline", "limits", "features")}} for k, v in PLANS.items()]

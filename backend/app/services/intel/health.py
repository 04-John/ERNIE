"""
Workspace health score (0-100): one number for "how healthy is my retention", with its parts shown.

  fintech health   40%  volume-weighted average of (1 - churn probability) across scored fintechs
  activation       25%  share of wallets that have ever transacted
  momentum         20%  28-day volume vs the previous 28 days
  diversification  15%  1 - concentration (HHI) of 90-day volume across fintechs

A part with no data (e.g. momentum before there are two periods) is left out and the rest re-weighted,
so the score never rewards or punishes missing information.
"""

from typing import Dict, List, Optional

WEIGHTS = {"fintech_health": 0.40, "activation": 0.25, "momentum": 0.20, "diversification": 0.15}
LABELS = {"fintech_health": "Fintech health", "activation": "Wallet activation", "momentum": "Volume momentum", "diversification": "Diversification"}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def momentum_value(change: Optional[float]) -> Optional[float]:
    """-50% or worse -> 0, flat -> 0.70, +20% or better -> 1."""
    return None if change is None else _clamp01(0.7 + change * 1.5)


def grade(score: int) -> str:
    return "Strong" if score >= 80 else "Healthy" if score >= 60 else "Needs attention" if score >= 40 else "At risk"


def health_score(scores: List[dict], activation_rate: Optional[float], volume_change: Optional[float],
                 shares: Dict[str, float]) -> dict:
    parts: Dict[str, Optional[tuple]] = {}

    scored = [r for r in scores if r.get("churn_risk") != "Unknown"]
    if scored:
        weights = [max(float(r.get("total_volume") or 0.0), 0.0) for r in scored]
        total = sum(weights)
        if total > 0:
            val = sum((1 - float(r["churn_probability"])) * w for r, w in zip(scored, weights)) / total
        else:
            val = sum(1 - float(r["churn_probability"]) for r in scored) / len(scored)
        high = sum(1 for r in scored if r["churn_risk"] == "High")
        parts["fintech_health"] = (_clamp01(val), f"{high} of {len(scored)} scored fintechs at high risk")
    else:
        parts["fintech_health"] = None

    parts["activation"] = None if activation_rate is None else (_clamp01(activation_rate), f"{activation_rate:.0%} of wallets have transacted")

    m = momentum_value(volume_change)
    parts["momentum"] = None if m is None else (m, f"Volume {volume_change:+.0%} vs the previous 28 days")

    if shares:
        hhi = sum(s * s for s in shares.values())
        top = max(shares.values())
        parts["diversification"] = (_clamp01(1 - hhi), f"Largest fintech is {top:.0%} of volume")
    else:
        parts["diversification"] = None

    present = {k: v for k, v in parts.items() if v is not None}
    if not present:
        return {"score": None, "grade": None, "components": []}
    wsum = sum(WEIGHTS[k] for k in present)
    total = sum(v[0] * WEIGHTS[k] for k, v in present.items()) / wsum
    score = int(round(total * 100))
    return {
        "score": score,
        "grade": grade(score),
        "components": [
            {"key": k, "label": LABELS[k], "weight": round(WEIGHTS[k] / wsum, 4), "value": round(present[k][0], 4),
             "points": round(present[k][0] * WEIGHTS[k] / wsum * 100, 1), "detail": present[k][1]}
            for k in WEIGHTS if k in present
        ],
    }

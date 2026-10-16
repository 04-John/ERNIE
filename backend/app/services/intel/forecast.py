"""
Forecasting and anomaly detection on daily volume.

Deliberately simple and transparent: additive Holt-Winters (level + trend + weekly seasonality),
parameters picked by one-step-ahead error on the series itself, and a weekday-median baseline with a
robust z-score for anomalies. No labels are needed, and every number can be explained.
"""

import itertools
from typing import List, Optional

import numpy as np
import pandas as pd

PERIOD = 7
MIN_DAYS = 28            # history needed before a forecast is offered
MIN_ACTIVE_DAYS = 10     # ...of which at least this many must have volume
Z_80 = 1.2816            # 80% prediction interval


def _fit(y: np.ndarray, alpha: float, beta: float, gamma: float):
    """Run additive Holt-Winters over y. Returns (sse, level, trend, season, residuals)."""
    m = PERIOD
    level = float(np.mean(y[:m]))
    trend = float((np.mean(y[m:2 * m]) - np.mean(y[:m])) / m) if len(y) >= 2 * m else 0.0
    season = [float(y[i] - level) for i in range(m)]
    resid = []
    for t in range(m, len(y)):
        s = season[t % m]
        pred = level + trend + s
        err = float(y[t]) - pred
        resid.append(err)
        new_level = alpha * (float(y[t]) - s) + (1 - alpha) * (level + trend)
        trend = beta * (new_level - level) + (1 - beta) * trend
        season[t % m] = gamma * (float(y[t]) - new_level) + (1 - gamma) * s
        level = new_level
    sse = float(np.sum(np.square(resid))) if resid else float("inf")
    return sse, level, trend, season, np.array(resid)


def forecast_volume(series: pd.Series, horizon: int = 30) -> dict:
    """
    series: daily volume (a DatetimeIndex, zero-filled). Returns a JSON-ready dict:
      status "ok" | "insufficient", history[], forecast[{day, value, low, high}], last30, next30, change
    """
    y = series.to_numpy(dtype=float)
    active = int((y > 0).sum())
    if len(y) < MIN_DAYS or active < MIN_ACTIVE_DAYS:
        return {"status": "insufficient", "reason": f"Needs at least {MIN_ACTIVE_DAYS} days with transactions within the last {len(y)} days.",
                "history": [], "forecast": [], "last30": None, "next30": None, "change": None}

    best = None
    for alpha, beta, gamma in itertools.product((0.1, 0.3, 0.5), (0.0, 0.05, 0.1), (0.1, 0.3)):
        sse, level, trend, season, resid = _fit(y, alpha, beta, gamma)
        if best is None or sse < best[0]:
            best = (sse, level, trend, season, resid, alpha)
    _, level, trend, season, resid, alpha = best
    sigma = float(np.std(resid)) if len(resid) > 1 else 0.0

    last_day = series.index[-1]
    t0 = len(y)
    points = []
    for h in range(1, horizon + 1):
        value = max(level + h * trend + season[(t0 + h - 1) % PERIOD], 0.0)
        spread = Z_80 * sigma * float(np.sqrt(1 + (h - 1) * alpha ** 2))
        points.append({"day": (last_day + pd.Timedelta(days=h)).date().isoformat(),
                       "value": round(value, 2), "low": round(max(value - spread, 0.0), 2), "high": round(value + spread, 2)})

    last30 = float(y[-30:].sum())
    next30 = float(sum(p["value"] for p in points[:30]))
    return {
        "status": "ok",
        "history": [{"day": d.date().isoformat(), "value": round(float(v), 2)} for d, v in zip(series.index[-60:], y[-60:])],
        "forecast": points,
        "last30": round(last30, 2),
        "next30": round(next30, 2),
        "change": None if last30 <= 0 else round((next30 - last30) / last30, 4),
        "method": "Additive Holt-Winters with weekly seasonality; band is an 80% prediction interval.",
    }


def detect_anomalies(series: pd.Series, lookback_days: int = 14, threshold: float = 3.5) -> List[dict]:
    """
    Days in the last `lookback_days` whose volume is unusual for that weekday, using a robust z-score
    (median/MAD) against the weekday medians of the preceding weeks.
    """
    y = series.astype(float)
    if len(y) < MIN_DAYS or int((y > 0).sum()) < MIN_ACTIVE_DAYS:
        return []
    base = y.iloc[:-lookback_days] if len(y) > lookback_days + MIN_DAYS // 2 else y
    weekday_median = base.groupby(base.index.weekday).median()
    expected = pd.Series([weekday_median.get(d.weekday(), base.median()) for d in y.index], index=y.index)
    resid = y - expected
    ref = resid.loc[base.index]
    mad = float(np.median(np.abs(ref - np.median(ref))))
    scale = 1.4826 * mad
    if scale <= 0:
        scale = float(np.std(ref)) or 1.0
    out = []
    for day in y.index[-lookback_days:]:
        z = float(resid.loc[day] / scale)
        if abs(z) >= threshold:
            out.append({"day": day.date().isoformat(), "value": round(float(y.loc[day]), 2),
                        "expected": round(float(expected.loc[day]), 2), "z": round(z, 1),
                        "direction": "spike" if z > 0 else "drop"})
    return out

"""
Intelligence orchestrator: everything ERNIE derives from a workspace's data beyond raw scoring.

Runs after every sync (in a worker thread). Output is stored in the workspace's state and read by the API:
  insights   prioritised findings with evidence and a recommended action
  forecast   30-day volume forecast with an 80% band
  anomalies  unusual days in the last two weeks
  cohorts    wallet activation/retention by creation month
  health     0-100 retention health score with its components
"""

from typing import List, Optional, Set

import pandas as pd

from app.services.intel import series, forecast as fc, cohorts as co, health as hl, insights as ins


def analyze(results: dict, addresses: List[dict], transactions: List[dict], live: bool,
            history: Optional[List[dict]] = None, prior_high_ids: Optional[Set[str]] = None) -> dict:
    history = history or []
    prior_high_ids = prior_high_ids or set()
    summary = results.get("summary") or {}
    scores = results.get("churn_scores") or []

    df = series.success_frame(transactions)
    now = pd.Timestamp.now(tz="UTC").tz_convert(None) if live else None
    end = series.anchor(df, now)

    daily = series.daily_volume(df, end, 120)
    forecast = fc.forecast_volume(daily)
    anomalies = fc.detect_anomalies(daily)

    windows = series.window_totals(df, end, 28)
    change = series.pct_change(*windows)
    shares = series.share_by_fintech(df, end, 90).to_dict()

    total_wallets = int(summary.get("total_wallets", 0))
    never = int(summary.get("never_active_wallets", 0))
    activation = (1 - never / total_wallets) if total_wallets else None

    health = hl.health_score(scores, activation, change, shares)
    health["volume_change"] = None if change is None else round(change, 4)

    return {
        "insights": ins.generate(scores, summary, df, addresses, end, change, windows, shares, forecast, anomalies,
                                 results.get("regional_summary") or [], history, prior_high_ids),
        "forecast": forecast,
        "anomalies": anomalies,
        "cohorts": co.wallet_cohorts(addresses, end),
        "health": health,
    }

"""
Time-series helpers shared by the intelligence modules.

All timestamps are naive UTC. "Now" for live data is the wall clock; for the demo dataset (whose
history ends in the past) it is the date of the last transaction, so the analysis looks the same
as it would on a live wallet.
"""

from typing import List, Optional, Tuple

import numpy as np
import pandas as pd


def success_frame(transactions: List[dict]) -> pd.DataFrame:
    """Successful transactions as a tidy frame: ts, usd, fintech_id, wallet_id."""
    rows = [t for t in transactions if t.get("status") == "SUCCESS"]
    if not rows:
        return pd.DataFrame({"ts": pd.Series(dtype="datetime64[ns]"), "usd": pd.Series(dtype=float),
                             "fintech_id": pd.Series(dtype=str), "wallet_id": pd.Series(dtype=str)})
    ts = pd.to_datetime(pd.Series([t.get("createdAt") for t in rows]), errors="coerce", utc=True).dt.tz_convert(None)
    df = pd.DataFrame({
        "ts": ts,
        "usd": [float(t.get("amountUsd") or 0.0) for t in rows],
        "fintech_id": [t.get("_fintechId") or "" for t in rows],
        "wallet_id": [t.get("_walletId") or "" for t in rows],
    })
    return df.dropna(subset=["ts"]).reset_index(drop=True)


def anchor(df: pd.DataFrame, as_of: Optional[pd.Timestamp]) -> pd.Timestamp:
    """The 'present' for this dataset."""
    if as_of is not None:
        return pd.Timestamp(as_of)
    return df["ts"].max() if not df.empty else pd.Timestamp.now()


def daily_volume(df: pd.DataFrame, end: pd.Timestamp, days: int = 120) -> pd.Series:
    """USD volume per calendar day for the `days` days ending at `end` (zero-filled)."""
    end_day = pd.Timestamp(end).normalize()
    index = pd.date_range(end=end_day, periods=days, freq="D")
    if df.empty:
        return pd.Series(0.0, index=index)
    per_day = df.assign(day=df["ts"].dt.normalize()).groupby("day")["usd"].sum()
    return per_day.reindex(index, fill_value=0.0)


def window_totals(df: pd.DataFrame, end: pd.Timestamp, days: int = 28) -> Tuple[float, float]:
    """(volume in the last `days` days, volume in the `days` days before that)."""
    end = pd.Timestamp(end)
    recent_start = end - pd.Timedelta(days=days)
    prior_start = end - pd.Timedelta(days=2 * days)
    recent = df[(df["ts"] > recent_start) & (df["ts"] <= end)]["usd"].sum()
    prior = df[(df["ts"] > prior_start) & (df["ts"] <= recent_start)]["usd"].sum()
    return float(recent), float(prior)


def pct_change(recent: float, prior: float) -> Optional[float]:
    """Relative change, or None when there is no earlier period to compare against."""
    return None if prior <= 0 else (recent - prior) / prior


def share_by_fintech(df: pd.DataFrame, end: pd.Timestamp, days: int = 90) -> pd.Series:
    """Each fintech's share (0..1) of the volume in the last `days` days, largest first."""
    end = pd.Timestamp(end)
    window = df[(df["ts"] > end - pd.Timedelta(days=days)) & (df["ts"] <= end)]
    totals = window.groupby("fintech_id")["usd"].sum()
    grand = totals.sum()
    return (totals / grand).sort_values(ascending=False) if grand > 0 else pd.Series(dtype=float)

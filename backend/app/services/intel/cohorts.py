"""Wallet cohorts: how well each month's new wallets activate and stay active."""

from typing import List

import pandas as pd

ACTIVE_WINDOW_DAYS = 30


def wallet_cohorts(addresses: List[dict], now: pd.Timestamp, months: int = 12) -> List[dict]:
    """
    One row per month in which wallets were created (newest first, at most `months`):
      wallets, activated_pct (ever transacted), active_pct (transacted in the last 30 days), never_pct
    """
    if not addresses:
        return []
    df = pd.DataFrame(addresses)
    created = pd.to_datetime(df["createdAt"], errors="coerce", utc=True).dt.tz_convert(None)
    last = pd.to_datetime(df["lastActive"].replace("", None), errors="coerce", utc=True).dt.tz_convert(None)
    never = df["neverActive"].fillna(False).astype(bool) if "neverActive" in df.columns else last.isna()
    frame = pd.DataFrame({
        "month": created.dt.to_period("M"),
        "never": never,
        "active": (~never) & (last >= pd.Timestamp(now) - pd.Timedelta(days=ACTIVE_WINDOW_DAYS)),
    }).dropna(subset=["month"])
    if frame.empty:
        return []
    grouped = frame.groupby("month").agg(wallets=("never", "size"), never=("never", "sum"), active=("active", "sum"))
    grouped = grouped.sort_index(ascending=False).head(months)
    out = []
    for month, r in grouped.iterrows():
        n = int(r["wallets"])
        out.append({
            "month": str(month), "wallets": n,
            "activated_pct": round(1 - float(r["never"]) / n, 4),
            "active_pct": round(float(r["active"]) / n, 4),
            "never_pct": round(float(r["never"]) / n, 4),
        })
    return out

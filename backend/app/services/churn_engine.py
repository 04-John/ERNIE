"""
Churn Engine
============
Takes raw addresses + transactions, engineers features,
scores every fintech with a churn probability, and returns
a ranked list with risk labels (High / Medium / Low).
"""

import pandas as pd
from datetime import datetime, timezone
from typing import List, Dict

END_DATE = pd.Timestamp("2026-03-01")


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────

def _to_naive_utc(series: pd.Series) -> pd.Series:
    """Parse mixed tz-aware/naive timestamps into naive UTC (safe to compare)."""
    return pd.to_datetime(series, errors="coerce", utc=True).dt.tz_convert(None)


def build_features(
    addresses: List[Dict],
    transactions: List[Dict],
    as_of: pd.Timestamp = END_DATE,
) -> pd.DataFrame:
    addr_df = pd.DataFrame(addresses)
    
    if addr_df.empty:
        return pd.DataFrame()

    addr_df["isDormant"] = addr_df["isDormant"].astype(int)

    wallet_stats = addr_df.groupby("_fintechId").agg(
        fintech_name=("_fintechName", "first"),
        region=("_region", "first"),
        country=("_country", "first"),
        type=("_fintechType", "first"),
        total_wallets=("id", "count"),
        dormant_wallets=("isDormant", "sum"),
        dormancy_rate=("isDormant", "mean"),
        avg_balance_usd=("balanceUsd", "mean"),
    ).reset_index().rename(columns={"_fintechId": "fintech_id"})

    # handle empty transactions gracefully
    if not transactions:
        wallet_stats["total_tx"]           = 0
        wallet_stats["total_volume"]       = 0.0
        wallet_stats["avg_tx_size"]        = 0.0
        wallet_stats["days_since_last_tx"] = 999
        wallet_stats["volume_trend"]       = 0.0
        wallet_stats["vol_recent_3m"]      = 0.0
        wallet_stats["vol_prior_3m"]       = 0.0
        return wallet_stats

    tx_df = pd.DataFrame(transactions)

    if "createdAt" not in tx_df.columns:
        tx_df["createdAt"] = pd.Timestamp.now()
    else:
        tx_df["createdAt"] = _to_naive_utc(tx_df["createdAt"])
        tx_df["createdAt"] = tx_df["createdAt"].fillna(as_of)

    success = tx_df[tx_df["status"] == "SUCCESS"] if "status" in tx_df.columns else tx_df

    if success.empty:
        wallet_stats["total_tx"]           = 0
        wallet_stats["total_volume"]       = 0.0
        wallet_stats["avg_tx_size"]        = 0.0
        wallet_stats["days_since_last_tx"] = 999
        wallet_stats["volume_trend"]       = 0.0
        wallet_stats["vol_recent_3m"]      = 0.0
        wallet_stats["vol_prior_3m"]       = 0.0
        return wallet_stats

    tx_stats = success.groupby("_fintechId").agg(
        total_tx=("id", "count"),
        total_volume=("amountUsd", "sum"),
        avg_tx_size=("amountUsd", "mean"),
        last_tx_date=("createdAt", "max"),
    ).reset_index().rename(columns={"_fintechId": "fintech_id"})

    tx_stats["days_since_last_tx"] = (
        as_of - tx_stats["last_tx_date"]
    ).dt.days

    recent_start = as_of - pd.DateOffset(months=3)
    prior_start  = as_of - pd.DateOffset(months=6)
    recent = success[success["createdAt"] >= recent_start]
    prior  = success[
        (success["createdAt"] >= prior_start) &
        (success["createdAt"] < recent_start)
    ]

    recent_vol = recent.groupby("_fintechId")["amountUsd"].sum().rename("vol_recent_3m")
    prior_vol  = prior.groupby("_fintechId")["amountUsd"].sum().rename("vol_prior_3m")

    trend = pd.concat([recent_vol, prior_vol], axis=1).fillna(0).reset_index()
    trend = trend.rename(columns={"_fintechId": "fintech_id"})
    trend["volume_trend"] = (
        (trend["vol_recent_3m"] - trend["vol_prior_3m"]) /
        (trend["vol_prior_3m"] + 1)
    )

    features = (
        wallet_stats
        .merge(tx_stats[["fintech_id","total_tx","total_volume",
                          "avg_tx_size","days_since_last_tx"]], on="fintech_id", how="left")
        .merge(trend[["fintech_id","volume_trend","vol_recent_3m","vol_prior_3m"]], on="fintech_id", how="left")
    )
    # fintechs with no successful transaction: "never transacted", not "transacted just now"
    features["days_since_last_tx"] = features["days_since_last_tx"].fillna(999)
    features = features.fillna(0)

    return features


# ─────────────────────────────────────────────
# CHURN SCORING
# ─────────────────────────────────────────────

# Heuristic v2. Each signal is scaled to 0..1 on an ABSOLUTE scale (never relative to other
# fintechs), weighted, and summed. There are no real churn outcomes to train on yet, so this is
# deliberately a transparent rule set whose every point can be explained to the user.
WEIGHTS = {"recency": 0.35, "dormancy": 0.20, "trend": 0.25, "activity": 0.20}
RECENCY_FULL_DAYS = 90        # silent for this long = maximum recency risk
LOW_ACTIVITY_FULL = 5         # fewer successful transactions than this = maximum activity risk
LOW_ACTIVITY_HALF = 20        # fewer than this = half
HIGH_AT = 0.60
MEDIUM_AT = 0.30

SIGNAL_LABELS = {
    "recency":  "Time since last transaction",
    "dormancy": "Dormant wallets",
    "trend":    "Volume trend",
    "activity": "Low activity",
}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _components(row) -> Dict[str, float]:
    prior, recent = float(row["vol_prior_3m"]), float(row["vol_recent_3m"])
    n = int(row["total_tx"])
    return {
        "recency":  _clamp01(float(row["days_since_last_tx"]) / RECENCY_FULL_DAYS),
        "dormancy": _clamp01(row["dormancy_rate"]),
        # only a drop counts, and only if there was an earlier period to compare against
        "trend":    0.0 if prior <= 0 else _clamp01((prior - recent) / prior),
        "activity": 1.0 if n < LOW_ACTIVITY_FULL else 0.5 if n < LOW_ACTIVITY_HALF else 0.0,
    }


def _explain(comp: Dict[str, float], row) -> List[Dict]:
    prior, recent = float(row["vol_prior_3m"]), float(row["vol_recent_3m"])
    days, n = float(row["days_since_last_tx"]), int(row["total_tx"])
    details = {
        "recency":  f"Last transaction {days:.0f} day{'' if round(days) == 1 else 's'} ago",
        "dormancy": f"{float(row['dormancy_rate']):.0%} of wallets inactive for {60}+ days",
        "trend":    "No earlier 3-month period to compare with yet" if prior <= 0
                    else f"Volume {(recent - prior) / prior:+.0%} vs the previous 3 months",
        "activity": f"{n} successful transaction{'' if n == 1 else 's'}",
    }
    return [
        {"key": k, "label": SIGNAL_LABELS[k], "weight": WEIGHTS[k], "value": round(comp[k], 4),
         "points": round(comp[k] * WEIGHTS[k], 4), "detail": details[k]}
        for k in WEIGHTS
    ]


def score_churn(features: pd.DataFrame) -> pd.DataFrame:
    """
    Absolute, explainable churn scoring. Adds:
      churn_probability  0..1, the weighted sum of the signals (independent of other fintechs)
      churn_risk         High (>= 0.60) / Medium (>= 0.30) / Low, or Unknown with no transaction history
      breakdown          per-signal contribution, so the UI can show exactly why
    """
    df = features.copy()
    if df.empty:
        return df

    probs, labels, breakdowns = [], [], []
    for _, row in df.iterrows():
        if int(row["total_tx"]) == 0:                      # nothing to judge: don't claim Low
            probs.append(0.0); labels.append("Unknown"); breakdowns.append([])
            continue
        comp = _components(row)
        p = round(sum(comp[k] * WEIGHTS[k] for k in WEIGHTS), 4)
        probs.append(p)
        labels.append("High" if p >= HIGH_AT else "Medium" if p >= MEDIUM_AT else "Low")
        breakdowns.append(_explain(comp, row))

    df["churn_probability"] = probs
    df["score"] = probs
    df["churn_risk"] = labels
    df["breakdown"] = breakdowns
    return df.sort_values(["churn_probability", "days_since_last_tx"], ascending=[False, False])


# ─────────────────────────────────────────────
# SUMMARY STATS
# ─────────────────────────────────────────────

def compute_summary(
    addresses: List[Dict],
    transactions: List[Dict],
    scored: pd.DataFrame,
) -> Dict:
    """Top-level KPIs for the dashboard header."""
    if not addresses:
        return {
            "total_wallets": 0,
            "total_fintechs": 0,
            "total_transactions": 0,
            "total_volume_usd": 0.0,
            "dormancy_rate": 0.0,
            "high_risk_fintechs": 0,
            "medium_risk_fintechs": 0,
            "low_risk_fintechs": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    success_tx = [t for t in transactions if t.get("status") == "SUCCESS"] if transactions else []
    total_volume = sum(t.get("amountUsd", 0) for t in success_tx)
    dormant_count = sum(1 for a in addresses if a.get("isDormant", False))
    never_active = sum(1 for a in addresses if a.get("neverActive", False))

    return {
        "total_wallets":       len(addresses),
        "total_fintechs":      len(scored) if not scored.empty else 1,
        "total_transactions":  len(success_tx),
        "total_volume_usd":    round(total_volume, 2),
        "dormancy_rate":       round(dormant_count / max(len(addresses), 1), 4),
        "dormant_wallets":     dormant_count,
        "never_active_wallets": never_active,
        "high_risk_fintechs":  int((scored["churn_risk"] == "High").sum())   if not scored.empty else 0,
        "medium_risk_fintechs":int((scored["churn_risk"] == "Medium").sum()) if not scored.empty else 0,
        "low_risk_fintechs":   int((scored["churn_risk"] == "Low").sum())    if not scored.empty else 0,
        "generated_at":        datetime.now(timezone.utc).isoformat(),
    }


# ─────────────────────────────────────────────
# MONTHLY VOLUME
# ─────────────────────────────────────────────

def compute_monthly_volume(transactions: List[Dict]) -> List[Dict]:
    """Monthly volume breakdown by region — for the line chart."""
    if not transactions:
        return []

    tx_df = pd.DataFrame(transactions)

    # handle missing columns gracefully
    if "status" not in tx_df.columns:
        tx_df["status"] = "SUCCESS"
    if "amountUsd" not in tx_df.columns:
        tx_df["amountUsd"] = 0.0
    if "_region" not in tx_df.columns:
        tx_df["_region"] = "Africa"
    if "createdAt" not in tx_df.columns:
        tx_df["createdAt"] = pd.Timestamp.now()

    tx_df = tx_df[tx_df["status"] == "SUCCESS"].copy()

    if tx_df.empty:
        return []

    tx_df["createdAt"] = _to_naive_utc(tx_df["createdAt"])
    tx_df = tx_df.dropna(subset=["createdAt"])

    if tx_df.empty:
        return []

    tx_df["month"] = tx_df["createdAt"].dt.to_period("M").astype(str)

    monthly = (
        tx_df.groupby(["month", "_region"])
        .agg(volume=("amountUsd", "sum"), tx_count=("id", "count"))
        .reset_index()
        .rename(columns={"_region": "region"})
    )

    return monthly.to_dict(orient="records")


# ─────────────────────────────────────────────
# REGIONAL SUMMARY
# ─────────────────────────────────────────────

def compute_regional_summary(
    addresses: List[Dict],
    scored: pd.DataFrame,
) -> List[Dict]:
    """Per-region aggregates — for the regional cards."""
    if not addresses:
        return []

    addr_df = pd.DataFrame(addresses)

    if "_region" not in addr_df.columns:
        addr_df["_region"] = "Africa"
    if "isDormant" not in addr_df.columns:
        addr_df["isDormant"] = 0

    if "neverActive" not in addr_df.columns:
        addr_df["neverActive"] = False

    wallet_counts = addr_df.groupby("_region").agg(
        total_wallets=("id", "count"),
        dormant_wallets=("isDormant", "sum"),
        never_active_wallets=("neverActive", "sum"),
    ).reset_index().rename(columns={"_region": "region"})

    if scored.empty:
        wallet_counts["fintechs"]       = 1
        wallet_counts["avg_churn_prob"] = 0.0
        wallet_counts["total_volume"]   = 0.0
        wallet_counts["dormancy_rate"]  = wallet_counts["dormant_wallets"] / wallet_counts["total_wallets"]
        wallet_counts["activation_rate"] = (
            wallet_counts["total_wallets"] - wallet_counts["dormant_wallets"] - wallet_counts["never_active_wallets"]
        ) / wallet_counts["total_wallets"]
        return wallet_counts.to_dict(orient="records")

    region_scores = scored.groupby("region").agg(
        fintechs=("fintech_id", "count"),
        avg_churn_prob=("churn_probability", "mean"),
        total_volume=("total_volume", "sum"),
    ).reset_index()

    summary = wallet_counts.merge(region_scores, on="region", how="left").fillna(0)
    summary["dormancy_rate"]   = summary["dormant_wallets"] / summary["total_wallets"]
    summary["activation_rate"] = (
        summary["total_wallets"] - summary["dormant_wallets"] - summary["never_active_wallets"]
    ) / summary["total_wallets"]

    return summary.to_dict(orient="records")


# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def run_churn_pipeline(
    addresses: List[Dict],
    transactions: List[Dict],
    as_of: pd.Timestamp = END_DATE,
) -> Dict:
    """
    Full pipeline:
      1. Build features
      2. Score churn
      3. (Optionally) train ML model
      4. Compute summaries
    Returns everything the API routes need.
    """
    print("\nRunning churn pipeline...")

    features = build_features(addresses, transactions, as_of)
    print(f"  Features built for {len(features)} fintechs")

    scored = score_churn(features)
    print(f"  Scored: High={( scored.churn_risk=='High').sum()} "
          f"Medium={(scored.churn_risk=='Medium').sum()} "
          f"Low={(scored.churn_risk=='Low').sum()}")


    summary = compute_summary(addresses, transactions, scored)
    monthly = compute_monthly_volume(transactions)
    regional = compute_regional_summary(addresses, scored)

    return {
        "summary": summary,
        "churn_scores": scored.to_dict(orient="records"),
        "monthly_volume": monthly,
        "regional_summary": regional,
    }
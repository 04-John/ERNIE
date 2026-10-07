"""
Churn Engine
============
Takes raw addresses + transactions, engineers features,
scores every fintech with a churn probability, and returns
a ranked list with risk labels (High / Medium / Low).
"""

import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report

END_DATE = pd.Timestamp("2026-03-01")
MODEL_PATH = Path(__file__).parent.parent.parent / "models" / "churn_model.joblib"


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
        .merge(trend[["fintech_id","volume_trend","vol_recent_3m"]], on="fintech_id", how="left")
        .fillna(0)
    )

    return features


# ─────────────────────────────────────────────
# CHURN SCORING
# ─────────────────────────────────────────────

def score_churn(features: pd.DataFrame) -> pd.DataFrame:
    """
    Rule-based churn scoring — robust for any dataset size.
    Produces a normalised churn_probability in [0, 1]
    and a churn_risk label: High / Medium / Low.
    """
    df = features.copy()

    df["score"] = 0.0

    # dormancy rate (0–1) — strongest signal
    df["score"] += df["dormancy_rate"] * 0.35

    # days since last tx — normalised
    max_days = df["days_since_last_tx"].max() or 1
    df["score"] += (df["days_since_last_tx"] / max_days) * 0.25

    # low transaction count
    df["score"] += df["total_tx"].apply(
        lambda x: 0.20 if x < 50 else (0.10 if x < 200 else 0)
    )

    # declining volume trend
    df["score"] += df["volume_trend"].apply(
        lambda x: 0.20 if x < -0.3 else (0.10 if x < 0 else 0)
    )

    # very low total volume
    df["score"] += df["total_volume"].apply(
        lambda x: 0.10 if x < 5_000 else 0
    )

    # normalise to [0, 1]
    min_score = df["score"].min()
    max_score = df["score"].max()
    if max_score > min_score:
        df["churn_probability"] = (
            (df["score"] - min_score) / (max_score - min_score)
        )
    else:
        df["churn_probability"] = 0.0

    # risk label
    df["churn_risk"] = pd.cut(
        df["churn_probability"],
        bins=[0, 0.33, 0.66, 1.0],
        labels=["Low", "Medium", "High"],
        include_lowest=True,
    )

    return df.sort_values("churn_probability", ascending=False)


# ─────────────────────────────────────────────
# ML MODEL (optional — trains if data is large enough)
# ─────────────────────────────────────────────

def train_model(features: pd.DataFrame) -> None:
    """
    Trains a Gradient Boosting classifier if we have
    enough labelled data (50+ fintechs). Saves to disk.
    """
    df = features.copy()

    if len(df) < 50:
        print("  Not enough data to train ML model — using rule-based scoring.")
        return

    # synthetic labels from rule-based scores for training
    df["label"] = (df["churn_probability"] > 0.5).astype(int)

    le = LabelEncoder()
    df["region_enc"] = le.fit_transform(df["region"].astype(str))

    FEATURE_COLS = [
        "total_wallets", "dormancy_rate", "total_tx", "total_volume",
        "avg_tx_size", "days_since_last_tx", "volume_trend",
        "vol_recent_3m", "avg_balance_usd", "region_enc",
    ]

    X = df[FEATURE_COLS]
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_prob = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_prob)
    print(f"  ML model AUC: {auc:.3f}")

    # save model
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"  Model saved -> {MODEL_PATH}")


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

    return {
        "total_wallets":       len(addresses),
        "total_fintechs":      len(scored) if not scored.empty else 1,
        "total_transactions":  len(success_tx),
        "total_volume_usd":    round(total_volume, 2),
        "dormancy_rate":       round(dormant_count / max(len(addresses), 1), 4),
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

    wallet_counts = addr_df.groupby("_region").agg(
        total_wallets=("id", "count"),
        dormant_wallets=("isDormant", "sum"),
    ).reset_index().rename(columns={"_region": "region"})

    if scored.empty:
        wallet_counts["fintechs"]       = 1
        wallet_counts["avg_churn_prob"] = 0.0
        wallet_counts["total_volume"]   = 0.0
        wallet_counts["dormancy_rate"]  = wallet_counts["dormant_wallets"] / wallet_counts["total_wallets"]
        wallet_counts["activation_rate"] = 1 - wallet_counts["dormancy_rate"]
        return wallet_counts.to_dict(orient="records")

    region_scores = scored.groupby("region").agg(
        fintechs=("fintech_id", "count"),
        avg_churn_prob=("churn_probability", "mean"),
        total_volume=("total_volume", "sum"),
    ).reset_index()

    summary = wallet_counts.merge(region_scores, on="region", how="left").fillna(0)
    summary["dormancy_rate"]   = summary["dormant_wallets"] / summary["total_wallets"]
    summary["activation_rate"] = 1 - summary["dormancy_rate"]

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

    # NOTE: train_model() is intentionally not called — it trains on labels derived
    # from the rule-based score itself (circular) and nothing loads the result.

    summary = compute_summary(addresses, transactions, scored)
    monthly = compute_monthly_volume(transactions)
    regional = compute_regional_summary(addresses, scored)

    return {
        "summary": summary,
        "churn_scores": scored.to_dict(orient="records"),
        "monthly_volume": monthly,
        "regional_summary": regional,
    }
"""
Insights engine
===============
Turns the workspace's numbers into a short, prioritised list of findings, each with the evidence behind
it and a concrete next step. Every rule is deterministic, so a finding can always be traced back to data.

Identity: list-style insights (high risk, went quiet, ...) are keyed by the SET of fintechs involved, so a
dismissed insight stays dismissed until the situation changes, and a changed situation is a new insight.
"""

import hashlib
from typing import Dict, List, Optional, Set

import pandas as pd

SEVERITY_BASE = {"critical": 100, "warning": 60, "info": 30, "positive": 20}
MAX_INSIGHTS = 12

# thresholds
VOLUME_DROP_CRITICAL, VOLUME_DROP_WARNING, VOLUME_GROWTH = -0.40, -0.20, 0.20
FINTECH_DROP = 0.50
MATERIAL_SHARE = 0.02            # a fintech must be at least 2% of prior volume for its drop to matter
WENT_QUIET_RATIO = 6.0           # silent for 6x its usual gap
CONCENTRATION_WARNING, CONCENTRATION_CRITICAL = 0.40, 0.60
ACTIVATION_WARNING, ACTIVATION_CRITICAL = 0.30, 0.60
ACTIVATION_MIN_WALLETS = 5
ACTIVATION_AGE_DAYS = 14
DORMANCY_WARNING, DORMANCY_CRITICAL = 0.05, 0.10
FORECAST_SWING = 0.25


def money(x: float) -> str:
    x = float(x)
    if abs(x) >= 1e9:
        return f"${x / 1e9:.2f}B"
    if abs(x) >= 1e6:
        return f"${x / 1e6:.2f}M"
    if abs(x) >= 1e3:
        return f"${x / 1e3:.1f}k"
    return f"${x:,.0f}"


def names(rows: List[dict], n: int = 3) -> str:
    ns = [r.get("fintech_name") or "A fintech" for r in rows]
    if len(ns) <= n:
        return ", ".join(ns[:-1]) + (" and " if len(ns) > 1 else "") + ns[-1] if ns else ""
    return ", ".join(ns[:n]) + f" and {len(ns) - n} more"


def plural(n: int, one: str, many: Optional[str] = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _key(kind: str, ids: List[str]) -> str:
    return f"{kind}:{hashlib.sha1(','.join(sorted(ids)).encode()).hexdigest()[:10]}" if ids else kind


def _ins(kind, severity, title, detail, action, ids=None, evidence=None, boost=0.0, stable=False):
    ids = list(ids or [])
    return {
        "key": kind if stable else _key(kind, ids), "kind": kind, "severity": severity, "title": title, "detail": detail,
        "action": action, "fintech_ids": ids, "evidence": evidence or {}, "priority": round(SEVERITY_BASE[severity] + boost, 2),
    }


def generate(
    scores: List[dict],
    summary: dict,
    tx: pd.DataFrame,
    addresses: List[dict],
    end: pd.Timestamp,
    volume_change: Optional[float],
    volume_windows: tuple,                       # (recent, prior) 28-day totals
    shares: Dict[str, float],                    # fintech_id -> share of 90-day volume
    forecast: dict,
    anomalies: List[dict],
    regional: List[dict],
    history: List[dict],                         # daily snapshots, oldest first
    prior_high_ids: Set[str],
) -> List[dict]:
    out: List[dict] = []
    by_id = {r["fintech_id"]: r for r in scores}

    # ── nothing to analyse yet
    if int(summary.get("total_transactions", 0)) == 0:
        wallets = int(summary.get("total_wallets", 0))
        if wallets == 0:
            return [_ins("getting_started", "info", "No wallets found yet",
                         "Your Blockradar wallet has no addresses, so there is nothing to analyse.",
                         "Create addresses for your fintech customers in Blockradar, then refresh.", stable=True)]
        return [_ins("getting_started", "info", "Waiting for your first transactions",
                     f"{plural(wallets, 'wallet')} connected, but no successful transactions yet. ERNIE scores risk and tracks trends as soon as activity arrives.",
                     "Make a test deposit or withdrawal on one of your wallets, then press Refresh.", stable=True)]

    recent_total = sum(float(r.get("vol_recent_3m") or 0.0) for r in scores)

    # ── high churn risk
    high = sorted([r for r in scores if r.get("churn_risk") == "High"], key=lambda r: -float(r.get("vol_recent_3m") or 0.0))
    if high:
        exposed = sum(float(r.get("vol_recent_3m") or 0.0) for r in high)
        share = exposed / recent_total if recent_total > 0 else 0.0
        sev = "critical" if (share >= 0.25 or len(high) >= 3) else "warning"
        title = f"{plural(len(high), 'fintech')} at high churn risk" + (f", holding {share:.0%} of recent volume" if share > 0 else "")
        lead = high[0]
        out.append(_ins("high_risk", sev, title,
                        f"Biggest exposure: {lead['fintech_name']}" + (f" ({money(lead.get('vol_recent_3m') or 0)} in the last 3 months)." if lead.get("vol_recent_3m") else "."),
                        f"Reach out to {names(high[:2])} first" + (" (they carry the most volume)." if len(high) > 1 else "."),
                        [r["fintech_id"] for r in high], {"count": len(high), "volume_share": round(share, 4), "volume": round(exposed, 2)}, boost=share * 40))

    # ── usually-active fintechs that went quiet
    quiet = []
    for r in scores:
        gaps, typical = int(r.get("gap_count") or 0), float(r.get("typical_gap_days") or 0.0)
        silent = float(r.get("days_since_last_tx") or 0.0)
        if gaps >= 4 and silent < 365 and silent / max(typical, 1.0) >= WENT_QUIET_RATIO and float(r.get("total_volume") or 0) > 0:
            quiet.append(r)
    quiet.sort(key=lambda r: -float(r.get("total_volume") or 0.0))
    if quiet:
        top_share = max((shares.get(r["fintech_id"], 0.0) for r in quiet), default=0.0)
        lead = quiet[0]
        usual = max(float(lead.get("median_gap_days") or 0.0), 1.0)
        out.append(_ins("went_quiet", "critical" if top_share >= 0.10 else "warning",
                        f"{plural(len(quiet), 'usually-active fintech')} went quiet",
                        f"{lead['fintech_name']} normally transacts every ~{usual:.0f} day{'' if round(usual) == 1 else 's'} and has been silent for {float(lead['days_since_last_tx']):.0f}.",
                        f"Check in with {names(quiet[:2])}: a sudden stop is the strongest early sign of churn.",
                        [r["fintech_id"] for r in quiet],
                        {"fintechs": [{"name": r["fintech_name"], "silent_days": round(float(r["days_since_last_tx"])), "usual_gap_days": round(max(float(r.get("median_gap_days") or 0.0), 1.0))} for r in quiet[:5]]},
                        boost=top_share * 40))

    # ── individual fintechs whose volume fell sharply
    if not tx.empty:
        rec_start, pri_start = end - pd.Timedelta(days=28), end - pd.Timedelta(days=56)
        rec = tx[(tx["ts"] > rec_start) & (tx["ts"] <= end)].groupby("fintech_id")["usd"].sum()
        pri = tx[(tx["ts"] > pri_start) & (tx["ts"] <= rec_start)].groupby("fintech_id")["usd"].sum()
        pri_total = float(pri.sum())
        drops = []
        for fid, p in pri.items():
            if pri_total > 0 and p / pri_total >= MATERIAL_SHARE and fid in by_id:
                r_ = float(rec.get(fid, 0.0))
                if (p - r_) / p >= FINTECH_DROP:
                    drops.append((fid, float(p), r_))
        drops.sort(key=lambda t: -(t[1] - t[2]))
        if drops:
            lost = sum(p - r_ for _, p, r_ in drops)
            lost_share = lost / pri_total if pri_total else 0.0
            lead = by_id[drops[0][0]]
            out.append(_ins("fintech_volume_drop", "critical" if lost_share >= 0.15 else "warning",
                            f"{plural(len(drops), 'fintech')} cut volume by half or more",
                            f"{lead['fintech_name']}: {money(drops[0][1])} to {money(drops[0][2])} in 4 weeks ({(drops[0][2] - drops[0][1]) / drops[0][1]:+.0%}). Together they lost {money(lost)}.",
                            "Ask what changed (pricing, product, integration issues) before they stop completely.",
                            [d[0] for d in drops],
                            {"lost": round(lost, 2), "lost_share": round(lost_share, 4),
                             "fintechs": [{"name": by_id[f]["fintech_name"], "before": round(p, 2), "after": round(a, 2)} for f, p, a in drops[:5]]},
                            boost=lost_share * 40))

    # ── whole-workspace volume trend
    if volume_change is not None:
        recent, prior = volume_windows
        if volume_change <= VOLUME_DROP_WARNING:
            out.append(_ins("volume_trend", "critical" if volume_change <= VOLUME_DROP_CRITICAL else "warning",
                            f"Volume is down {abs(volume_change):.0%} over the last 4 weeks",
                            f"{money(recent)} versus {money(prior)} in the previous 4 weeks.",
                            "Open the fintechs flagged here to see where the drop is coming from.",
                            evidence={"recent": round(recent, 2), "prior": round(prior, 2), "change": round(volume_change, 4)},
                            boost=min(abs(volume_change), 1) * 30, stable=True))
        elif volume_change >= VOLUME_GROWTH:
            out.append(_ins("volume_trend", "positive", f"Volume is up {volume_change:.0%} over the last 4 weeks",
                            f"{money(recent)} versus {money(prior)} in the previous 4 weeks.",
                            "Find out which fintechs are driving the growth and support them.",
                            evidence={"recent": round(recent, 2), "prior": round(prior, 2), "change": round(volume_change, 4)}, stable=True))

    # ── concentration
    if shares:
        top_id, top_share = max(shares.items(), key=lambda kv: kv[1])
        if top_share >= CONCENTRATION_WARNING and top_id in by_id:
            out.append(_ins("concentration", "critical" if top_share >= CONCENTRATION_CRITICAL else "warning",
                            f"{by_id[top_id]['fintech_name']} is {top_share:.0%} of your volume",
                            "Losing them would remove that share of your last 90 days of volume.",
                            "Protect this relationship, and work on broadening the base so no single fintech decides your month.",
                            [top_id], {"share": round(top_share, 4)}, boost=top_share * 20))

    # ── wallets that never activated
    total_wallets = len(addresses)
    stale = [a for a in addresses if a.get("neverActive") and int(a.get("daysSinceLastTx") or 0) > ACTIVATION_AGE_DAYS]
    if total_wallets >= ACTIVATION_MIN_WALLETS and stale:
        ratio = len(stale) / total_wallets
        if ratio >= ACTIVATION_WARNING:
            out.append(_ins("activation_gap", "critical" if ratio >= ACTIVATION_CRITICAL else "warning",
                            f"{ratio:.0%} of wallets have never transacted",
                            f"{plural(len(stale), 'wallet')} created more than {ACTIVATION_AGE_DAYS} days ago still has no successful transaction.",
                            "Add an onboarding nudge (a first-transaction prompt or incentive) for new wallets.",
                            evidence={"wallets": len(stale), "share": round(ratio, 4)}, boost=ratio * 15, stable=True))

    # ── dormancy rising versus ~4 weeks ago
    if history:
        latest = history[-1]
        older = [h for h in history if 21 <= (pd.Timestamp(latest["day"]) - pd.Timestamp(h["day"])).days <= 45]
        if older:
            base = older[-1]
            delta = float(latest["dormancy_rate"]) - float(base["dormancy_rate"])
            if delta >= DORMANCY_WARNING:
                out.append(_ins("dormancy_rising", "critical" if delta >= DORMANCY_CRITICAL else "warning",
                                f"Dormancy is up {delta * 100:.0f} points in about a month",
                                f"{float(base['dormancy_rate']):.0%} to {float(latest['dormancy_rate']):.0%} of wallets inactive for 60+ days.",
                                "Launch a re-engagement campaign for wallets that went quiet recently.",
                                evidence={"from": base["dormancy_rate"], "to": latest["dormancy_rate"]}, boost=delta * 50, stable=True))

    # ── recoveries
    recovered = [by_id[f] for f in prior_high_ids if f in by_id and by_id[f].get("churn_risk") in ("Low", "Medium")]
    if recovered:
        out.append(_ins("recovered", "positive", f"{plural(len(recovered), 'fintech')} recovered from high risk",
                        f"{names(recovered)} {'is' if len(recovered) == 1 else 'are'} no longer high risk.",
                        "Note what worked (outreach, pricing, product changes) and repeat it.",
                        [r["fintech_id"] for r in recovered]))

    # ── regional hotspot
    scored = [r for r in scores if r.get("churn_risk") != "Unknown"]
    if scored and regional:
        overall = sum(float(r["churn_probability"]) for r in scored) / len(scored)
        for reg in regional:
            avg, n = float(reg.get("avg_churn_prob") or 0.0), int(reg.get("fintechs") or 0)
            if n >= 3 and avg >= 0.30 and overall > 0 and avg >= 1.5 * overall:
                out.append(_ins("regional_hotspot", "info", f"{reg['region']} is running hotter than the rest",
                                f"Average churn risk there is {avg:.0%} versus {overall:.0%} overall, across {n} fintechs.",
                                f"Look for a regional cause (payment rails, regulation, support coverage) in {reg['region']}.",
                                evidence={"region": reg["region"], "avg": round(avg, 4), "overall": round(overall, 4)}))
                break

    # ── forecast
    if forecast.get("status") == "ok" and forecast.get("change") is not None:
        ch = float(forecast["change"])
        if ch <= -FORECAST_SWING:
            out.append(_ins("forecast_decline", "warning", f"Volume is forecast to fall {abs(ch):.0%} over the next 30 days",
                            f"{money(forecast['next30'])} expected versus {money(forecast['last30'])} in the last 30 days.",
                            "Act on the at-risk fintechs now to protect next month's volume.",
                            evidence={"next30": forecast["next30"], "last30": forecast["last30"], "change": ch}, boost=min(abs(ch), 1) * 20, stable=True))
        elif ch >= FORECAST_SWING:
            out.append(_ins("forecast_growth", "positive", f"Volume is forecast to rise {ch:.0%} over the next 30 days",
                            f"{money(forecast['next30'])} expected versus {money(forecast['last30'])} in the last 30 days.",
                            "Make sure support and liquidity are ready for the extra activity.",
                            evidence={"next30": forecast["next30"], "last30": forecast["last30"], "change": ch}, stable=True))

    # ── recent anomalies
    for a in anomalies[-2:]:
        day = pd.Timestamp(a["day"]).strftime("%b %d")
        spike = a["direction"] == "spike"
        out.append(_ins("volume_anomaly", "info" if spike else "warning", f"Unusual volume {'spike' if spike else 'drop'} on {day}",
                        f"{money(a['value'])} versus about {money(a['expected'])} expected for that weekday.",
                        "Check for a one-off event (a large transfer, an outage or a campaign)." if spike else "Check for an outage or an integration problem that day.",
                        evidence=a, stable=False, ids=[a["day"]]))

    out.sort(key=lambda i: -i["priority"])
    return out[:MAX_INSIGHTS]

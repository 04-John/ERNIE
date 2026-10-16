from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from app.services.intel import series, forecast as fc, cohorts as co, health as hl, insights as ins

END = pd.Timestamp("2026-06-30")


def tx(fid, days_ago, usd=100.0, status="SUCCESS"):
    return {"id": f"{fid}-{days_ago}-{usd}", "status": status, "amountUsd": usd, "_fintechId": fid, "_walletId": f"w-{fid}",
            "createdAt": (END - timedelta(days=days_ago)).isoformat()}


# ───────────────────────── series helpers ─────────────────────────

def test_only_successful_transactions_are_analysed_and_the_frame_is_tidy():
    df = series.success_frame([tx("a", 1), tx("a", 2, status="FAILED"), tx("b", 3, usd=50), {"status": "SUCCESS", "createdAt": "garbage", "amountUsd": 5}])
    assert len(df) == 2 and set(df["fintech_id"]) == {"a", "b"}
    assert series.success_frame([]).empty


def test_daily_volume_is_zero_filled_and_windows_compare_like_with_like():
    df = series.success_frame([tx("a", 1, 100), tx("a", 1, 50), tx("a", 40, 300)])
    daily = series.daily_volume(df, END, days=60)
    assert len(daily) == 60 and daily.iloc[-2] == 150 and daily.sum() == 450 and (daily == 0).sum() == 58
    recent, prior = series.window_totals(df, END, days=28)
    assert (recent, prior) == (150.0, 300.0)
    assert series.pct_change(recent, prior) == pytest.approx(-0.5) and series.pct_change(10, 0) is None


def test_shares_sum_to_one_and_are_sorted_largest_first():
    df = series.success_frame([tx("big", 5, 700), tx("small", 5, 200), tx("tiny", 5, 100), tx("old", 200, 9999)])
    s = series.share_by_fintech(df, END, days=90)
    assert list(s.index) == ["big", "small", "tiny"] and s.sum() == pytest.approx(1.0) and s["big"] == pytest.approx(0.7)


# ───────────────────────── forecasting ─────────────────────────

def weekly(days=120, base=1000.0, slope=0.0, weekend=0.4, noise=0.0, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range(end=END, periods=days, freq="D")
    vals = [max(base * (weekend if d.weekday() >= 5 else 1.0) + slope * i + rng.normal(0, noise), 0) for i, d in enumerate(idx)]
    return pd.Series(vals, index=idx)


def test_forecast_follows_the_weekly_pattern_and_the_level():
    s = weekly(noise=20)
    f = fc.forecast_volume(s)
    assert f["status"] == "ok" and len(f["forecast"]) == 30
    expected = sum(1000 * (0.4 if (END + timedelta(days=h)).weekday() >= 5 else 1.0) for h in range(1, 31))
    assert f["next30"] == pytest.approx(expected, rel=0.08)
    weekdays = {p["day"]: p["value"] for p in f["forecast"]}
    sat = next(v for d, v in weekdays.items() if pd.Timestamp(d).weekday() == 5)
    mon = next(v for d, v in weekdays.items() if pd.Timestamp(d).weekday() == 0)
    assert sat < mon * 0.7                                          # weekends are quieter, and the model knows


def test_forecast_band_brackets_the_point_and_is_never_negative():
    f = fc.forecast_volume(weekly(noise=150))
    assert all(p["low"] <= p["value"] <= p["high"] and p["low"] >= 0 and p["value"] >= 0 for p in f["forecast"])
    widths = [p["high"] - p["low"] for p in f["forecast"]]
    assert widths[-1] >= widths[0]                                  # uncertainty grows with the horizon


def test_a_declining_series_forecasts_a_decline_and_a_growing_one_growth():
    down = fc.forecast_volume(weekly(slope=-6.0, noise=10))
    up = fc.forecast_volume(weekly(slope=+6.0, noise=10))
    assert down["change"] < -0.1 and up["change"] > 0.1


def test_forecast_declines_to_guess_without_enough_history():
    short = weekly(days=20)
    sparse = pd.Series([0.0] * 100 + [500.0] * 5, index=pd.date_range(end=END, periods=105, freq="D"))
    for s in (short, sparse):
        f = fc.forecast_volume(s)
        assert f["status"] == "insufficient" and f["forecast"] == [] and f["reason"]


# ───────────────────────── anomalies ─────────────────────────

def test_a_spike_and_a_drop_are_detected_in_the_recent_window():
    s = weekly(noise=15)
    s.iloc[-3] = s.iloc[-3] * 6                    # a huge day
    s.iloc[-8] = 0.0 if s.index[-8].weekday() < 5 else s.iloc[-8]
    found = fc.detect_anomalies(s)
    assert any(a["direction"] == "spike" and a["day"] == s.index[-3].date().isoformat() for a in found)
    assert all(abs(a["z"]) >= 3.5 for a in found)


def test_normal_noise_does_not_trigger_anomalies_and_short_series_are_skipped():
    assert fc.detect_anomalies(weekly(noise=20)) == []
    assert fc.detect_anomalies(weekly(days=15)) == []


def test_weekends_being_quiet_is_not_an_anomaly():
    assert fc.detect_anomalies(weekly(noise=0, weekend=0.2)) == []


# ───────────────────────── cohorts ─────────────────────────

def test_cohorts_report_activation_and_current_activity_by_creation_month():
    now = END
    wallets = [
        {"createdAt": "2026-05-03T00:00:00Z", "neverActive": False, "lastActive": (now - timedelta(days=2)).isoformat()},
        {"createdAt": "2026-05-20T00:00:00Z", "neverActive": False, "lastActive": (now - timedelta(days=90)).isoformat()},
        {"createdAt": "2026-05-25T00:00:00Z", "neverActive": True, "lastActive": ""},
        {"createdAt": "2026-04-01T00:00:00Z", "neverActive": True, "lastActive": ""},
    ]
    rows = co.wallet_cohorts(wallets, now)
    assert [r["month"] for r in rows] == ["2026-05", "2026-04"]
    may = rows[0]
    assert may["wallets"] == 3 and may["activated_pct"] == pytest.approx(2 / 3, abs=1e-3)
    assert may["active_pct"] == pytest.approx(1 / 3, abs=1e-3) and may["never_pct"] == pytest.approx(1 / 3, abs=1e-3)
    assert co.wallet_cohorts([], now) == []


# ───────────────────────── health score ─────────────────────────

def scored(fid, prob, vol, risk=None):
    return {"fintech_id": fid, "churn_probability": prob, "total_volume": vol,
            "churn_risk": risk or ("High" if prob >= .6 else "Medium" if prob >= .3 else "Low")}


def test_health_weights_and_grades():
    assert sum(hl.WEIGHTS.values()) == pytest.approx(1.0)
    assert [hl.grade(s) for s in (95, 70, 45, 10)] == ["Strong", "Healthy", "Needs attention", "At risk"]
    assert hl.momentum_value(-0.5) == 0 and hl.momentum_value(0.0) == pytest.approx(0.7) and hl.momentum_value(0.2) == 1.0 and hl.momentum_value(None) is None


def test_a_perfect_workspace_scores_100_and_a_failing_one_scores_low():
    great = hl.health_score([scored("a", 0, 100), scored("b", 0, 100)], 1.0, 0.5, {"a": .5, "b": .5})
    assert great["score"] >= 90 and great["grade"] == "Strong"
    bad = hl.health_score([scored("a", .9, 100), scored("b", .9, 100)], 0.1, -0.6, {"a": 1.0})
    assert bad["score"] <= 15 and bad["grade"] == "At risk"


def test_health_is_volume_weighted_and_explains_itself():
    h = hl.health_score([scored("big", 0.0, 900), scored("tiny", 1.0, 100)], None, None, {})
    assert h["score"] == 90                                          # only fintech health is known: 0.9
    assert [c["key"] for c in h["components"]] == ["fintech_health"] and h["components"][0]["weight"] == pytest.approx(1.0)
    assert "1 of 2" in h["components"][0]["detail"]


def test_missing_parts_are_reweighted_not_punished():
    full = hl.health_score([scored("a", 0, 1)], 1.0, 0.0, {"a": 0.3, "b": 0.7})
    no_momentum = hl.health_score([scored("a", 0, 1)], 1.0, None, {"a": 0.3, "b": 0.7})
    assert abs(sum(c["weight"] for c in no_momentum["components"]) - 1.0) < 1e-3
    assert "momentum" not in [c["key"] for c in no_momentum["components"]] and no_momentum["score"] >= full["score"] - 1
    assert hl.health_score([], None, None, {}) == {"score": None, "grade": None, "components": []}


def test_a_single_fintech_is_maximally_concentrated():
    h = hl.health_score([scored("a", 0, 1)], 1.0, 0.2, {"a": 1.0})
    div = next(c for c in h["components"] if c["key"] == "diversification")
    assert div["value"] == 0.0 and "100%" in div["detail"]


# ───────────────────────── insights ─────────────────────────

def row(fid, name=None, risk="Low", prob=0.1, recent=1000.0, total=5000.0, silent=1.0, typical=1.0, gaps=0, median=None, region="R"):
    return {"fintech_id": fid, "fintech_name": name or fid.upper(), "churn_risk": risk, "churn_probability": prob, "vol_recent_3m": recent,
            "total_volume": total, "days_since_last_tx": silent, "typical_gap_days": typical, "median_gap_days": typical if median is None else median,
            "gap_count": gaps, "region": region}


def run(scores, txs=None, summary=None, wallets=None, change=None, windows=(0, 0), shares=None, forecast=None, anomalies=None,
        regional=None, history=None, prior_high=None):
    df = series.success_frame(txs or [])
    summary = summary or {"total_transactions": 10, "total_wallets": len(wallets or [1])}
    return ins.generate(scores, summary, df, wallets or [], END, change, windows, shares or {}, forecast or {"status": "insufficient"},
                        anomalies or [], regional or [], history or [], prior_high or set())


def kinds(result):
    return {i["kind"]: i for i in result}


def test_with_no_transactions_the_only_insight_is_getting_started():
    r = run([], summary={"total_transactions": 0, "total_wallets": 6})
    assert [i["kind"] for i in r] == ["getting_started"] and "6 wallets" in r[0]["detail"] and r[0]["severity"] == "info"
    assert run([], summary={"total_transactions": 0, "total_wallets": 0})[0]["title"] == "No wallets found yet"


def test_high_risk_severity_depends_on_count_and_exposed_volume():
    one_small = run([row("a", risk="High", recent=100), row("b", recent=9900)])
    assert kinds(one_small)["high_risk"]["severity"] == "warning"
    one_big = run([row("a", risk="High", recent=5000), row("b", recent=5000)])
    assert kinds(one_big)["high_risk"]["severity"] == "critical" and kinds(one_big)["high_risk"]["evidence"]["volume_share"] == pytest.approx(0.5)
    three = run([row(f"h{i}", risk="High", recent=10) for i in range(3)] + [row("ok", recent=100000)])
    assert kinds(three)["high_risk"]["severity"] == "critical"


def test_a_dismissal_key_changes_when_the_set_of_fintechs_changes_but_not_otherwise():
    base = [row("a", risk="High"), row("b")]
    k1 = kinds(run(base))["high_risk"]["key"]
    assert kinds(run(base))["high_risk"]["key"] == k1
    assert kinds(run([row("a", risk="High"), row("b", risk="High")]))["high_risk"]["key"] != k1


def test_went_quiet_needs_a_known_rhythm_and_a_long_enough_silence():
    quiet = run([row("a", name="Alpha", silent=30, typical=1, gaps=50, total=9000), row("b", silent=30, typical=1, gaps=2),
                 row("c", silent=5, typical=1, gaps=50), row("d", silent=30, typical=30, gaps=50)])
    q = kinds(quiet)["went_quiet"]
    assert q["fintech_ids"] == ["a"] and "Alpha normally transacts every ~1 day" in q["detail"] and "silent for 30" in q["detail"]


def test_a_fintech_that_halved_its_volume_is_flagged_only_if_it_matters():
    txs = ([tx("big", d, 100) for d in range(35, 50)] + [tx("big", 3, 100)] +              # 1500 prior -> 100 recent
           [tx("steady", d, 100) for d in list(range(1, 20)) + list(range(30, 50))] +
           [tx("tiny", 40, 1), tx("tiny", 3, 0.1)])                                          # tiny: huge drop, immaterial
    r = run([row("big", "Big"), row("steady"), row("tiny")], txs=txs)
    d = kinds(r)["fintech_volume_drop"]
    assert d["fintech_ids"] == ["big"] and "Big" in d["detail"] and d["evidence"]["lost_share"] > 0.2 and d["severity"] == "critical"


def test_workspace_volume_trend_thresholds():
    sev = lambda c: [i["severity"] for i in run([row("a")], change=c, windows=(500, 1000)) if i["kind"] == "volume_trend"]
    assert sev(-0.45) == ["critical"] and sev(-0.25) == ["warning"] and sev(-0.10) == [] and sev(0.30) == ["positive"] and sev(None) == []


def test_concentration_thresholds():
    sev = lambda s: [i["severity"] for i in run([row("a")], shares={"a": s, "x": (1 - s) / 2, "y": (1 - s) / 2}) if i["kind"] == "concentration"]
    assert sev(0.65) == ["critical"] and sev(0.45) == ["warning"] and sev(0.30) == []


def test_activation_gap_needs_enough_old_never_active_wallets():
    mk = lambda n_stale, n_ok: ([{"neverActive": True, "daysSinceLastTx": 40} for _ in range(n_stale)] +
                                [{"neverActive": False, "daysSinceLastTx": 1} for _ in range(n_ok)] +
                                [{"neverActive": True, "daysSinceLastTx": 3} for _ in range(5)])      # brand new: never counted
    a = [i for i in run([row("a")], wallets=mk(10, 14)) if i["kind"] == "activation_gap"]      # 10 of 29 = 34%
    assert a and a[0]["severity"] == "warning" and a[0]["evidence"]["wallets"] == 10
    worse = [i for i in run([row("a")], wallets=mk(30, 4)) if i["kind"] == "activation_gap"]   # 30 of 39 = 77%
    assert worse and worse[0]["severity"] == "critical"
    assert not [i for i in run([row("a")], wallets=mk(2, 40)) if i["kind"] == "activation_gap"]       # too few / too small a share


def test_dormancy_rising_compares_with_about_a_month_ago():
    hist = lambda old, new: [{"day": (END - timedelta(days=30)).date().isoformat(), "dormancy_rate": old}, {"day": END.date().isoformat(), "dormancy_rate": new}]
    sev = lambda o, n: [i["severity"] for i in run([row("a")], history=hist(o, n)) if i["kind"] == "dormancy_rising"]
    assert sev(0.30, 0.42) == ["critical"] and sev(0.30, 0.36) == ["warning"] and sev(0.30, 0.31) == []
    too_recent = [{"day": (END - timedelta(days=3)).date().isoformat(), "dormancy_rate": 0.1}, {"day": END.date().isoformat(), "dormancy_rate": 0.9}]
    assert not [i for i in run([row("a")], history=too_recent) if i["kind"] == "dormancy_rising"]


def test_recoveries_are_celebrated():
    r = run([row("a", "Alpha", risk="Low"), row("b", risk="High")], prior_high={"a", "b"})
    rec = kinds(r)["recovered"]
    assert rec["severity"] == "positive" and rec["fintech_ids"] == ["a"] and "Alpha" in rec["detail"]


def test_a_hot_region_is_called_out_only_when_clearly_worse():
    scores = [row(f"f{i}", risk="Low", prob=0.15) for i in range(6)] + [row(f"x{i}", risk="High", prob=0.8, region="Hot") for i in range(3)]
    reg = [{"region": "Hot", "avg_churn_prob": 0.8, "fintechs": 3}, {"region": "Calm", "avg_churn_prob": 0.15, "fintechs": 6}]
    assert kinds(run(scores, regional=reg))["regional_hotspot"]["evidence"]["region"] == "Hot"
    assert "regional_hotspot" not in kinds(run(scores, regional=[{"region": "Hot", "avg_churn_prob": 0.8, "fintechs": 2}]))


def test_forecast_and_anomaly_findings():
    down = kinds(run([row("a")], forecast={"status": "ok", "change": -0.4, "next30": 600, "last30": 1000}))["forecast_decline"]
    assert down["severity"] == "warning" and "40%" in down["title"]
    up = kinds(run([row("a")], forecast={"status": "ok", "change": 0.5, "next30": 1500, "last30": 1000}))["forecast_growth"]
    assert up["severity"] == "positive"
    assert not [i for i in run([row("a")], forecast={"status": "ok", "change": 0.1, "next30": 1100, "last30": 1000}) if i["kind"].startswith("forecast")]
    a = run([row("a")], anomalies=[{"day": "2026-06-20", "value": 9000, "expected": 1000, "z": 9.0, "direction": "spike"},
                                   {"day": "2026-06-25", "value": 0, "expected": 1000, "z": -6.0, "direction": "drop"}])
    sev = {i["title"].split(" on ")[0]: i["severity"] for i in a if i["kind"] == "volume_anomaly"}
    assert sev == {"Unusual volume spike": "info", "Unusual volume drop": "warning"}


def test_insights_are_sorted_by_priority_and_capped():
    many = [row(f"h{i}", risk="High", recent=100) for i in range(4)] + [row("ok", recent=1000)]
    r = run(many, change=-0.5, windows=(100, 200), shares={"ok": 0.7, "h0": 0.3}, forecast={"status": "ok", "change": 0.6, "next30": 1, "last30": 1})
    pri = [i["priority"] for i in r]
    assert pri == sorted(pri, reverse=True) and len(r) <= ins.MAX_INSIGHTS
    assert r[0]["severity"] == "critical" and r[-1]["severity"] in ("positive", "info", "warning")
    assert all({"key", "kind", "severity", "title", "detail", "action", "fintech_ids", "evidence", "priority"} <= set(i) for i in r)

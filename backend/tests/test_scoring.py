import pandas as pd
import pytest

from app.services import churn_engine as ce


def feat(**over):
    base = dict(fintech_id="f", fintech_name="F", region="R", country="C", type="T", total_wallets=1,
                dormant_wallets=0, dormancy_rate=0.0, avg_balance_usd=0.0, total_tx=100, total_volume=10_000.0,
                avg_tx_size=100.0, days_since_last_tx=0, volume_trend=0.0, vol_recent_3m=1000.0, vol_prior_3m=1000.0,
                median_gap_days=0.0, typical_gap_days=0.0, gap_count=0)
    base.update(over)
    return base


def score(*rows):
    return ce.score_churn(pd.DataFrame(list(rows)))


def prob(**over):
    return float(score(feat(**over)).iloc[0]["churn_probability"])


def test_weights_add_up_to_one():
    assert sum(ce.WEIGHTS.values()) == pytest.approx(1.0)


def test_a_healthy_fintech_is_low_risk():
    out = score(feat()).iloc[0]
    assert out["churn_risk"] == "Low" and out["churn_probability"] == 0.0


def test_the_longer_a_fintech_is_silent_the_riskier_and_it_caps_at_90_days():
    p = [prob(days_since_last_tx=d) for d in (0, 30, 60, 90, 400)]
    assert p == sorted(p) and p[0] < p[1] < p[2] < p[3]
    assert p[3] == p[4]                                                    # beyond 90 days adds nothing more


def test_a_score_does_not_depend_on_other_fintechs():
    mine = feat(fintech_id="me", days_since_last_tx=50, dormancy_rate=0.4)
    alone = float(score(mine).iloc[0]["churn_probability"])
    crowd = score(mine, feat(fintech_id="a", days_since_last_tx=200, dormancy_rate=1.0),
                  feat(fintech_id="b"), feat(fintech_id="c", days_since_last_tx=10))
    assert float(crowd[crowd["fintech_id"] == "me"].iloc[0]["churn_probability"]) == alone


def test_only_a_volume_drop_counts_and_only_with_an_earlier_period_to_compare():
    assert prob(vol_prior_3m=1000, vol_recent_3m=2000) == 0.0              # growing: no penalty
    assert prob(vol_prior_3m=0, vol_recent_3m=0) == 0.0                    # nothing to compare with
    half = prob(vol_prior_3m=1000, vol_recent_3m=500)
    gone = prob(vol_prior_3m=1000, vol_recent_3m=0)
    assert half == pytest.approx(0.125, abs=1e-3) and gone == pytest.approx(0.25, abs=1e-3)


def test_low_activity_is_penalised_in_steps():
    assert prob(total_tx=2) == pytest.approx(0.20) and prob(total_tx=10) == pytest.approx(0.10) and prob(total_tx=50) == 0.0


@pytest.mark.parametrize("kwargs,tier", [
    (dict(), "Low"),
    (dict(days_since_last_tx=90, total_tx=100), "Medium"),                 # 0.35
    (dict(days_since_last_tx=90, dormancy_rate=1.0, total_tx=100), "Medium"),   # 0.55
    (dict(days_since_last_tx=90, dormancy_rate=1.0, total_tx=2), "High"),  # 0.75
])
def test_tier_thresholds(kwargs, tier):
    assert score(feat(**kwargs)).iloc[0]["churn_risk"] == tier


def test_no_transaction_history_means_unknown_not_low():
    out = score(feat(total_tx=0, days_since_last_tx=999)).iloc[0]
    assert out["churn_risk"] == "Unknown" and out["churn_probability"] == 0.0 and out["breakdown"] == []


def test_the_breakdown_explains_the_score_exactly():
    out = score(feat(days_since_last_tx=45, dormancy_rate=0.5, vol_prior_3m=1000, vol_recent_3m=400, total_tx=12)).iloc[0]
    bd = out["breakdown"]
    assert [b["key"] for b in bd] == ["recency", "dormancy", "trend", "activity"]
    assert sum(b["points"] for b in bd) == pytest.approx(out["churn_probability"], abs=1e-3)
    assert all(0.0 <= b["value"] <= 1.0 and b["detail"] for b in bd)
    assert "45 days ago" in bd[0]["detail"] and "-60%" in bd[2]["detail"]


def test_results_are_sorted_riskiest_first():
    out = score(feat(fintech_id="ok"), feat(fintech_id="bad", days_since_last_tx=120, dormancy_rate=1.0, total_tx=1),
                feat(fintech_id="mid", days_since_last_tx=45))
    assert list(out["fintech_id"]) == ["bad", "mid", "ok"]


# ───────────── personalised rhythm (heuristic v3) ─────────────

def rhythm(typical, silent, gaps=20, median=None):
    return feat(typical_gap_days=typical, median_gap_days=typical if median is None else median, gap_count=gaps, days_since_last_tx=silent)


def test_the_same_silence_means_different_things_for_different_fintechs():
    daily = float(score(rhythm(typical=1, silent=20)).iloc[0]["breakdown"][0]["value"])      # normally daily, silent 20 days
    monthly = float(score(rhythm(typical=30, silent=20)).iloc[0]["breakdown"][0]["value"])   # normally monthly, silent 20 days
    assert daily == 1.0 and monthly == 0.0


def test_silence_up_to_twice_the_usual_gap_is_normal_and_eight_times_is_maximum():
    v = lambda silent: float(score(rhythm(typical=10, silent=silent)).iloc[0]["breakdown"][0]["value"])
    assert v(5) == 0.0 and v(20) == 0.0                           # up to 2x
    assert 0.0 < v(50) < 1.0 and v(80) == 1.0 and v(500) == 1.0   # ramps to 8x, then capped
    assert v(30) < v(50) < v(70)


def test_without_enough_history_it_falls_back_to_the_fixed_90_day_scale():
    few = score(rhythm(typical=1, silent=45, gaps=3)).iloc[0]["breakdown"][0]
    assert few["value"] == pytest.approx(0.5) and "45 days ago" in few["detail"] and few["label"] == "Time since last transaction"


def test_the_explanation_names_the_fintechs_own_rhythm():
    b = score(rhythm(typical=2, silent=24, gaps=30, median=2)).iloc[0]["breakdown"][0]
    assert b["label"] == "Silence vs its usual rhythm"
    assert "every ~2 days" in b["detail"] and "silent for 24" in b["detail"] and "12.0x" in b["detail"]


def test_cadence_is_learned_from_real_transactions():
    from datetime import timedelta
    as_of = pd.Timestamp("2026-06-01")

    def txs(fid, days_ago):
        return [{"id": f"{fid}{i}", "status": "SUCCESS", "amountUsd": 50.0, "_fintechId": fid,
                 "createdAt": (as_of - timedelta(days=d)).isoformat()} for i, d in enumerate(days_ago)]

    addrs = [{"id": f"w{f}", "isDormant": False, "_fintechId": f, "_fintechName": f.upper(), "_region": "R", "_country": "C",
              "_fintechType": "T", "balanceUsd": 0.0} for f in ("daily", "monthly")]
    daily = txs("daily", range(10, 40))                          # every day, then silent for 10 days
    monthly = txs("monthly", [10, 40, 70, 100, 130, 160, 190])   # every 30 days, last one 10 days ago
    feats = ce.build_features(addrs, daily + monthly, as_of=as_of).set_index("fintech_id")

    assert feats.loc["daily", "typical_gap_days"] == 1.0 and feats.loc["daily", "gap_count"] == 29
    assert feats.loc["monthly", "typical_gap_days"] == 30.0 and feats.loc["monthly", "median_gap_days"] == 30.0
    scored = ce.score_churn(feats.reset_index()).set_index("fintech_id")
    assert scored.loc["daily", "churn_probability"] > scored.loc["monthly", "churn_probability"]    # same silence, very different risk
    assert scored.loc["monthly", "breakdown"][0]["value"] == 0.0
    assert scored.loc["daily", "breakdown"][0]["value"] == pytest.approx(1.0, abs=0.01) or scored.loc["daily", "breakdown"][0]["value"] > 0.9


def test_bursty_fintechs_are_not_flagged_for_an_ordinary_pause():
    # transacts in bursts: many 1-day gaps and a few long ones. The 90th percentile reflects the long ones.
    from datetime import timedelta
    as_of = pd.Timestamp("2026-06-01")
    days_ago = [3, 4, 5, 6, 16, 17, 18, 19, 29, 30, 31, 32, 42, 43, 44]   # bursts of 4 days, 10-day pauses
    t = [{"id": str(i), "status": "SUCCESS", "amountUsd": 10.0, "_fintechId": "b", "createdAt": (as_of - timedelta(days=d)).isoformat()} for i, d in enumerate(days_ago)]
    a = [{"id": "w", "isDormant": False, "_fintechId": "b", "_fintechName": "B", "_region": "R", "_country": "C", "_fintechType": "T", "balanceUsd": 0.0}]
    f = ce.build_features(a, t, as_of=as_of).iloc[0]
    assert f["median_gap_days"] == 1.0 and f["typical_gap_days"] >= 10.0
    # silent 3 days is well within a burst-and-pause pattern: no recency penalty
    assert ce.score_churn(pd.DataFrame([f]))["breakdown"].iloc[0][0]["value"] == 0.0

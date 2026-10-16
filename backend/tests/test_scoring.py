import pandas as pd
import pytest

from app.services import churn_engine as ce


def feat(**over):
    base = dict(fintech_id="f", fintech_name="F", region="R", country="C", type="T", total_wallets=1,
                dormant_wallets=0, dormancy_rate=0.0, avg_balance_usd=0.0, total_tx=100, total_volume=10_000.0,
                avg_tx_size=100.0, days_since_last_tx=0, volume_trend=0.0, vol_recent_3m=1000.0, vol_prior_3m=1000.0)
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

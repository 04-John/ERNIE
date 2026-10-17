from datetime import datetime, timedelta, timezone

from conftest import register, KEY_A, WALLET_A
from app.core.database import SessionLocal
from app.core.state import states
from app.models.insights import InsightRecord


def connect(client, h):
    assert client.put("/workspace/connection", headers=h, json={"api_key": KEY_A, "wallet_id": WALLET_A}).status_code == 200


def refresh(client, h):
    assert client.post("/analytics/refresh", headers=h).status_code == 200


def iso_days_ago(d):
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat().replace("+00:00", "Z")


def dormant(fake, *indexes, days=200):
    for i in indexes:
        fake.datasets[KEY_A]["txs"][i]["createdAt"] = iso_days_ago(days)


def active(fake, *indexes):
    for i in indexes:
        fake.datasets[KEY_A]["txs"][i]["createdAt"] = iso_days_ago(0.001)


def insights(client, h):
    return client.get("/intelligence/insights", headers=h).json()


def kinds(client, h):
    return {i["kind"]: i for i in insights(client, h)["data"]}


def org(client, h):
    return client.get("/workspace", headers=h).json()["workspace"]["id"]


def test_intelligence_endpoints_require_login(client):
    for path in ("/intelligence/insights", "/intelligence/forecast", "/intelligence/cohorts", "/intelligence/health"):
        assert client.get(path).status_code == 401, path
    assert client.post("/intelligence/insights/dismiss", json={"key": "x"}).status_code == 401


def test_a_connected_workspace_gets_health_cohorts_and_an_honest_forecast_status(client):
    h = register(client)
    connect(client, h)
    health = client.get("/intelligence/health", headers=h).json()
    assert isinstance(health["score"], int) and 0 <= health["score"] <= 100 and health["grade"]
    assert abs(sum(c["weight"] for c in health["components"]) - 1.0) < 1e-3
    fc = client.get("/intelligence/forecast", headers=h).json()
    assert fc["forecast"]["status"] == "insufficient" and fc["forecast"]["reason"]          # 3 transactions: no pretend forecast
    cohorts = client.get("/intelligence/cohorts", headers=h).json()["data"]
    assert cohorts and cohorts[0]["month"] == "2026-01" and cohorts[0]["wallets"] == 3
    assert insights(client, h)["demo"] is False


def test_the_health_score_is_stored_daily_for_trends(client):
    h = register(client)
    connect(client, h)
    row = client.get("/analytics/history", headers=h).json()["data"][0]
    assert isinstance(row["health_score"], (int, float))


def test_dismissal_lifecycle(client, fake):
    h = register(client)
    connect(client, h)
    assert "high_risk" not in kinds(client, h)                       # everyone is active

    dormant(fake, 1)                                                  # one fintech goes silent
    refresh(client, h)
    first = kinds(client, h)["high_risk"]
    assert first["dismissable"] is True and first["fintech_ids"] == ["a-a1"] and first["action"] and first["evidence"]["count"] == 1

    assert client.post("/intelligence/insights/dismiss", headers=h, json={"key": first["key"]}).status_code == 200
    assert "high_risk" not in kinds(client, h)                       # hidden
    refresh(client, h)
    assert "high_risk" not in kinds(client, h)                       # ...and stays hidden while the situation is unchanged

    dormant(fake, 2)                                                  # the situation changes: a second fintech
    refresh(client, h)
    second = kinds(client, h)["high_risk"]
    assert second["key"] != first["key"] and set(second["fintech_ids"]) == {"a-a1", "a-a2"}   # a NEW insight, shown again

    active(fake, 1, 2)                                                # everyone recovers: both episodes resolve
    refresh(client, h)
    assert "high_risk" not in kinds(client, h)

    dormant(fake, 1)                                                  # the original situation returns
    refresh(client, h)
    again = kinds(client, h)["high_risk"]
    assert again["key"] == first["key"]                              # same situation, but a new episode: visible again


def test_insights_survive_a_restart_with_their_dismissals(client, fake):
    h = register(client)
    connect(client, h)
    dormant(fake, 1)
    refresh(client, h)
    key = kinds(client, h)["high_risk"]["key"]
    other = kinds(client, h)
    states.clear()                                                    # process restart
    assert kinds(client, h)["high_risk"]["key"] == key
    client.post("/intelligence/insights/dismiss", headers=h, json={"key": key})
    states.clear()
    assert "high_risk" not in kinds(client, h) and len(other) >= 1


def test_demo_workspaces_see_insights_but_cannot_dismiss_them(client):
    h = register(client)                                              # not connected: demo data
    body = insights(client, h)
    assert body["demo"] is True and body["data"] and all(i["dismissable"] is False for i in body["data"])
    r = client.post("/intelligence/insights/dismiss", headers=h, json={"key": body["data"][0]["key"]})
    assert r.status_code == 400
    assert client.get("/intelligence/health", headers=h).json()["score"] is not None


def test_one_workspace_cannot_dismiss_anothers_insights(client, fake):
    a, b = register(client, "A"), register(client, "B")
    connect(client, a)
    dormant(fake, 1)
    refresh(client, a)
    key = kinds(client, a)["high_risk"]["key"]
    connect(client, b)                                                # B has the same wallet data...
    assert client.post("/intelligence/insights/dismiss", headers=b, json={"key": "no-such-insight"}).status_code == 404
    assert "high_risk" in kinds(client, a)                           # A is untouched
    with SessionLocal() as db:
        assert db.query(InsightRecord).filter_by(org_id=org(client, a), key=key).count() == 1
        assert db.query(InsightRecord).filter_by(org_id=org(client, b), key=key).count() in (0, 1)


def test_disconnecting_deletes_the_stored_insights(client, fake):
    h = register(client)
    connect(client, h)
    dormant(fake, 1)
    refresh(client, h)
    o = org(client, h)
    with SessionLocal() as db:
        assert db.query(InsightRecord).filter_by(org_id=o).count() >= 1
    client.delete("/workspace/connection", headers=h)
    with SessionLocal() as db:
        assert db.query(InsightRecord).filter_by(org_id=o).count() == 0


def test_dismissed_findings_are_counted_and_can_be_brought_back(client, fake):
    h = register(client)
    connect(client, h)
    dormant(fake, 1)
    refresh(client, h)
    key = kinds(client, h)["high_risk"]["key"]
    assert client.get("/intelligence/insights", headers=h).json()["dismissed"] == 0
    client.post("/intelligence/insights/dismiss", headers=h, json={"key": key})
    body = client.get("/intelligence/insights", headers=h).json()
    assert body["dismissed"] >= 1 and "high_risk" not in kinds(client, h)
    r = client.post("/intelligence/insights/restore", headers=h)
    assert r.status_code == 200 and r.json()["restored"] >= 1
    assert "high_risk" in kinds(client, h) and client.get("/intelligence/insights", headers=h).json()["dismissed"] == 0


def test_restoring_only_touches_your_own_workspace_and_demo_is_refused(client, fake):
    a, b = register(client, "A"), register(client, "B")
    connect(client, a)
    dormant(fake, 1)
    refresh(client, a)
    client.post("/intelligence/insights/dismiss", headers=a, json={"key": kinds(client, a)["high_risk"]["key"]})
    assert client.post("/intelligence/insights/restore", headers=b).status_code == 400            # B is still on demo data
    connect(client, b)
    assert client.post("/intelligence/insights/restore", headers=b).json()["restored"] == 0       # nothing of B's was dismissed
    assert client.get("/intelligence/insights", headers=a).json()["dismissed"] >= 1               # A's dismissal is intact
    assert client.post("/intelligence/insights/restore").status_code == 401


# ───────────────────────── wallet list: status filter ─────────────────────────

def test_wallet_list_can_be_filtered_by_status(client, fake):
    h = register(client)
    connect(client, h)
    dormant(fake, 1)                                                  # one wallet goes silent
    refresh(client, h)
    everything = client.get("/wallets/activity", headers=h).json()
    by = {s: client.get(f"/wallets/activity?status={s}", headers=h).json() for s in ("active", "dormant", "never")}
    assert everything["total"] == by["active"]["total"] + by["dormant"]["total"] + by["never"]["total"]
    assert by["dormant"]["total"] >= 1 and all(w["isDormant"] and not w.get("neverActive") for w in by["dormant"]["data"])
    assert all(not w["isDormant"] and not w.get("neverActive") for w in by["active"]["data"])
    assert all(w.get("neverActive") for w in by["never"]["data"])
    assert client.get("/wallets/activity?status=bogus", headers=h).status_code == 422

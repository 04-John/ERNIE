from datetime import datetime, timedelta, timezone

from conftest import register, make_dataset, KEY_A, KEY_B, WALLET_A, WALLET_B
from app.core.database import SessionLocal
from app.models.stored import FintechDaily


def connect(client, h, key=KEY_A, wallet=WALLET_A):
    assert client.put("/workspace/connection", headers=h, json={"api_key": key, "wallet_id": wallet}).status_code == 200


def detail(client, h, fid):
    return client.get(f"/churn/fintech/{fid}", headers=h)


def test_detail_requires_login(client):
    assert client.get("/churn/fintech/anything").status_code == 401


def test_detail_has_the_score_the_reasons_the_wallets_and_the_activity(client):
    h = register(client)
    connect(client, h)
    r = detail(client, h, "a-a0")
    assert r.status_code == 200
    body = r.json()

    f = body["fintech"]
    assert f["fintech_name"] == "A Fintech 0"
    assert f["churn_risk"] in ("Low", "Medium", "High") and [b["key"] for b in f["breakdown"]] == ["recency", "dormancy", "trend", "activity"]
    assert body["wallet_count"] == 1 and body["wallets"][0]["id"] == "a-a0"
    assert len(body["activity"]) == 26 and sum(w["transactions"] for w in body["activity"]) == 1
    assert len(body["recent_transactions"]) == 1 and body["recent_transactions"][0]["currency"] == "USDC"
    assert body["demo"] is False


def test_list_endpoints_stay_light_and_exclude_the_breakdown(client):
    h = register(client)
    connect(client, h)
    rows = client.get("/churn/scores", headers=h).json()["data"]
    assert rows and all("breakdown" not in r for r in rows)
    assert all("breakdown" not in r for r in client.get("/churn/high-risk", headers=h).json()["data"])


def test_unknown_fintech_is_404(client):
    h = register(client)
    connect(client, h)
    assert detail(client, h, "does-not-exist").status_code == 404


def test_one_workspace_cannot_read_another_workspaces_fintech(client, fake):
    a, b = register(client, "A"), register(client, "B")
    connect(client, a, KEY_A, WALLET_A)
    connect(client, b, KEY_B, WALLET_B)
    assert detail(client, a, "a-a0").status_code == 200
    assert detail(client, b, "a-a0").status_code == 404                      # B has no such fintech
    assert detail(client, b, "b-a0").status_code == 200


def test_risk_history_is_recorded_once_per_day(client):
    h = register(client)
    connect(client, h)
    client.post("/analytics/refresh", headers=h)                              # same day: replaces, doesn't duplicate
    hist = detail(client, h, "a-a0").json()["history"]
    assert len(hist) == 1 and hist[0]["risk"] in ("Low", "Medium", "High") and hist[0]["transactions"] == 1

    org = client.get("/workspace", headers=h).json()["workspace"]["id"]
    with SessionLocal() as db:                                                # add an older day: history is ordered
        row = db.query(FintechDaily).filter_by(org_id=org, fintech_id="a-a0").order_by(FintechDaily.day.desc()).first()
        db.add(FintechDaily(org_id=row.org_id, fintech_id="a-a0", day=row.day - timedelta(days=3), fintech_name="x",
                            risk="Low", probability=0.1, total_volume_usd=0, transactions=0, days_since_last_tx=0))
        db.commit()
    days = [p["day"] for p in detail(client, h, "a-a0").json()["history"]]
    assert days == sorted(days) and len(days) == 2


def test_demo_workspaces_get_a_detail_page_but_no_history(client):
    h = register(client)                                                      # not connected: demo data
    first = client.get("/churn/scores", headers=h).json()["data"][0]["fintech_id"]
    body = detail(client, h, first).json()
    assert body["demo"] is True and body["history"] == [] and body["fintech"]["breakdown"]


def test_history_is_deleted_with_the_connection(client):
    h = register(client)
    connect(client, h)
    org = client.get("/workspace", headers=h).json()["workspace"]["id"]
    with SessionLocal() as db:
        assert db.query(FintechDaily).filter_by(org_id=org).count() == 3
    client.delete("/workspace/connection", headers=h)
    with SessionLocal() as db:
        assert db.query(FintechDaily).filter_by(org_id=org).count() == 0

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


# ───────────────────────── list rows: top reason and sparklines ─────────────────────────

def test_list_rows_carry_one_line_reason_without_the_heavy_breakdown(client):
    h = register(client)
    connect(client, h)
    rows = client.get("/churn/scores", headers=h).json()["data"]
    full = detail(client, h, rows[0]["fintech_id"]).json()["fintech"]
    best = max((b for b in full["breakdown"] if b["points"] > 0), key=lambda b: b["points"])
    assert rows[0]["top_reason"] == best["detail"] and "breakdown" not in rows[0]
    assert all("top_reason" in r for r in client.get("/churn/high-risk", headers=h).json()["data"])


def seed_history(org_id, fintech_id, probs):
    today = datetime.now(timezone.utc).date()
    with SessionLocal() as db:
        for i, p in enumerate(probs):
            db.add(FintechDaily(org_id=org_id, fintech_id=fintech_id, day=today - timedelta(days=len(probs) - i), fintech_name="x",
                                risk="Low", probability=p, total_volume_usd=0, transactions=0, days_since_last_tx=0))
        db.commit()


def test_sparklines_are_scoped_ordered_and_capped(client, fake):
    a, b = register(client), register(client)
    connect(client, a)
    connect(client, b, KEY_B, WALLET_B)
    org_a = client.get("/workspace", headers=a).json()["workspace"]["id"]
    org_b = client.get("/workspace", headers=b).json()["workspace"]["id"]
    seed_history(org_a, "a-a0", [0.2, 0.4, 0.6])
    seed_history(org_b, "a-a0", [0.9, 0.9, 0.9])                       # same fintech id, another workspace
    got = client.get("/churn/sparklines?ids=a-a0,nope", headers=a).json()["data"]
    assert got["a-a0"][:3] == [0.2, 0.4, 0.6] and "nope" not in got    # oldest first (today's real score comes last); the other workspace's 0.9s never leak in
    assert 0.9 not in got["a-a0"]
    assert client.get("/churn/sparklines?ids=a-a0", headers=b).json()["data"]["a-a0"][:3] == [0.9, 0.9, 0.9]
    many = ",".join(f"id{i}" for i in range(50))
    assert client.get(f"/churn/sparklines?ids={many}", headers=a).status_code == 200
    assert client.get("/churn/sparklines?ids=a-a0").status_code == 401


def test_sparklines_are_empty_for_the_demo_dataset(client):
    h = register(client)
    assert client.get("/churn/sparklines?ids=anything", headers=h).json() == {"data": {}}

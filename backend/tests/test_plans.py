from conftest import register, set_plan
from app.services import plans, netsafe


def invite(client, h, n=0):
    return client.post("/workspace/invites", headers=h, json={"email": f"p{n}@example.com"})


def channel(client, h, n):
    return client.post("/workspace/alerts/channels", headers=h, json={"kind": "webhook", "target": f"https://hooks.example.com/{n}"})


def test_a_new_workspace_is_on_the_free_plan_and_sees_its_usage(client):
    h = register(client)
    p = client.get("/workspace", headers=h).json()["plan"]
    assert p["id"] == "free" and p["price_usd"] == 0
    assert p["limits"] == {"members": 2, "alert_channels": 1, "ai_messages": 10, "history_days": 30}
    assert p["usage"] == {"members": 1, "alert_channels": 0, "ai_messages": 0}


def test_invites_count_toward_the_member_limit_and_402_invites_an_upgrade(client):
    h = register(client)
    assert invite(client, h, 1).status_code == 200            # 1 member + 1 pending = 2 of 2
    r = invite(client, h, 2)
    assert r.status_code == 402 and "Upgrade" in r.json()["detail"] and "Free" in r.json()["detail"]
    set_plan(client, h, "pro")
    assert invite(client, h, 2).status_code == 200
    assert client.get("/workspace", headers=h).json()["plan"]["usage"]["members"] == 3


def test_alert_channels_follow_the_plan(client, monkeypatch):
    monkeypatch.setattr(netsafe, "_resolve", lambda host: ["93.184.216.34"])
    h = register(client)
    assert channel(client, h, 1).status_code == 200
    assert channel(client, h, 2).status_code == 402
    set_plan(client, h, "pro")
    assert channel(client, h, 2).status_code == 200


def test_limits_are_per_workspace(client):
    a, b = register(client), register(client)
    set_plan(client, a, "business")
    assert client.get("/workspace", headers=b).json()["plan"]["id"] == "free"
    assert client.get("/workspace", headers=a).json()["plan"]["limits"]["members"] == 50


def test_history_window_is_clamped_to_the_plan(client, monkeypatch):
    seen = []
    from app.api.routes import analytics
    monkeypatch.setattr(analytics, "load_history", lambda key, days: seen.append(days) or [])
    h = register(client)
    # a workspace needs a connection to leave the demo; the clamp is checked directly as well
    org = type("O", (), {"plan": "free"})()
    assert plans.clamp_history(org, 500) == 30 and plans.clamp_history(type("O", (), {"plan": "business"})(), 500) == 500
    assert plans.clamp_history(type("O", (), {"plan": "nonsense"})(), 500) == 30      # unknown plan falls back to free
    assert client.get("/analytics/history?days=500", headers=h).json()["demo"] is True


def test_public_plan_list_has_no_internal_fields():
    out = plans.public_plans()
    assert [p["id"] for p in out] == ["free", "pro", "business"]
    assert all(set(p) == {"id", "name", "price_usd", "tagline", "limits", "features"} for p in out)

from conftest import register, KEY_A, KEY_B, WALLET_A, WALLET_B
from app.core.database import SessionLocal
from app.models.organization import BlockradarConnection
from app.models.user import User
from app.services import crypto


def summary(client, h):
    return client.get("/analytics/summary", headers=h).json()["data"]


def status(client, h):
    return client.get("/analytics/status", headers=h).json()


def connect(client, h, key=KEY_A, wallet=WALLET_A):
    return client.put("/workspace/connection", headers=h, json={"api_key": key, "wallet_id": wallet})


def test_data_routes_require_login(client):
    for path in ["/analytics/summary", "/churn/scores", "/wallets/dormancy", "/workspace", "/analytics/status"]:
        assert client.get(path).status_code == 401, path


def test_new_workspace_sees_demo_data_until_connected(client):
    h = register(client)
    assert summary(client, h)["total_wallets"] == 7
    st = status(client, h)
    assert st["data_source"] == "simulated" and st["connected"] is False


def test_workspaces_are_isolated(client):
    a, b = register(client, "Alice"), register(client, "Bob")
    assert connect(client, a, KEY_A, WALLET_A).status_code == 200
    assert connect(client, b, KEY_B, WALLET_B).status_code == 200

    # each sees only its own wallet's data
    assert summary(client, a)["total_wallets"] == 3
    assert summary(client, b)["total_wallets"] == 5
    names_a = {r["fintech_name"] for r in client.get("/churn/scores", headers=a).json()["data"]}
    names_b = {r["fintech_name"] for r in client.get("/churn/scores", headers=b).json()["data"]}
    assert names_a and names_b and names_a.isdisjoint(names_b)
    assert all(n.startswith("A ") for n in names_a) and all(n.startswith("B ") for n in names_b)

    # a third, unconnected workspace sees demo data, not A's or B's
    c = register(client, "Carol")
    assert summary(client, c)["total_wallets"] == 7
    assert status(client, a)["data_source"] == "real" and status(client, a)["connected"] is True


def test_api_key_never_returned_and_stored_encrypted(client):
    h = register(client)
    r = connect(client, h)
    body = r.text + client.get("/workspace", headers=h).text + client.get("/auth/me", headers=h).text
    assert KEY_A not in body
    conn = client.get("/workspace", headers=h).json()["connection"]
    assert conn["connected"] and conn["api_key_last4"] == KEY_A[-4:]
    assert WALLET_A not in str(conn["wallet_id"])  # masked

    with SessionLocal() as db:
        row = db.query(BlockradarConnection).first()
        assert row.api_key_enc != KEY_A and KEY_A not in row.api_key_enc
        assert crypto.decrypt(row.api_key_enc) == KEY_A


def test_invalid_credentials_are_rejected_and_not_stored(client):
    h = register(client)
    assert connect(client, h, key="not-a-real-key-123456").status_code == 400          # verify fails
    assert connect(client, h, wallet="../../etc/passwd").status_code == 400             # not a UUID
    assert connect(client, h, wallet=WALLET_A + "/../x").status_code == 400
    assert connect(client, h, key="has spaces in it 123456").status_code == 400
    assert client.get("/workspace", headers=h).json()["connection"]["connected"] is False


def test_members_cannot_change_the_connection(client):
    admin = register(client, "Admin")
    with SessionLocal() as db:
        admin_user = db.query(User).filter(User.email.like("user%")).order_by(User.created_at.desc()).first()
        member = User(email="member@example.com", name="Member", org_id=admin_user.org_id, role="member",
                      hashed_password=__import__("app.services.auth", fromlist=["x"]).hash_password("password123"), is_verified=True)
        db.add(member); db.commit()
    token = client.post("/auth/login", json={"email": "member@example.com", "password": "password123"}).json()["access_token"]
    mh = {"Authorization": f"Bearer {token}"}

    assert connect(client, mh).status_code == 403
    assert client.delete("/workspace/connection", headers=mh).status_code == 403
    assert client.get("/workspace", headers=mh).json()["role"] == "member"       # but they can read
    assert connect(client, admin).status_code == 200


def test_disconnect_returns_to_demo_and_clears_data(client):
    h = register(client)
    connect(client, h)
    assert summary(client, h)["total_wallets"] == 3
    assert client.delete("/workspace/connection", headers=h).json()["connection"]["connected"] is False
    assert summary(client, h)["total_wallets"] == 7
    org_id = client.get("/workspace", headers=h).json()["workspace"]["id"]
    with SessionLocal() as db:
        assert db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).count() == 0


def test_failed_sync_keeps_last_good_data_and_reports_error(client, fake):
    h = register(client)
    connect(client, h)
    assert summary(client, h)["total_wallets"] == 3

    fake.fail = True
    r = client.post("/analytics/refresh", headers=h)
    assert r.status_code == 200
    st = status(client, h)
    assert "Blockradar is down" in st["last_error"]
    assert st["data_source"] == "real"                       # stale-but-real, never swapped for demo data
    assert summary(client, h)["total_wallets"] == 3


def test_reconnecting_replaces_data(client):
    h = register(client)
    connect(client, h, KEY_A, WALLET_A)
    assert summary(client, h)["total_wallets"] == 3
    connect(client, h, KEY_B, WALLET_B)
    assert summary(client, h)["total_wallets"] == 5
    org_id = client.get("/workspace", headers=h).json()["workspace"]["id"]
    with SessionLocal() as db:
        assert db.query(BlockradarConnection).filter(BlockradarConnection.org_id == org_id).count() == 1  # replaced, not duplicated


def test_manual_refresh_on_demo_is_a_noop(client):
    h = register(client)
    r = client.post("/analytics/refresh", headers=h)
    assert r.status_code == 200 and r.json()["connected"] is False

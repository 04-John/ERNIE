from app.services import auth as auth_service


def login(client, email, password="guess-1234", query=""):
    return client.post(f"/auth/login{query}", json={"email": email, "password": password}).status_code


def test_clients_cannot_raise_their_own_limit(client):
    codes = [login(client, f"nobody{i}@example.com", query="?limit=1000000&window=1") for i in range(11)]
    assert codes == [401] * 10 + [429]


def test_logins_are_limited_per_account_even_from_fresh_ips(client):
    client.post("/auth/register", json={"email": "target@example.com", "password": "password123", "name": "T"})
    codes = []
    for _ in range(11):
        auth_service._attempts.clear()                                  # a new IP for every guess
        codes.append(login(client, "target@example.com"))
    assert codes == [401] * 10 + [429]
    auth_service._attempts.clear()
    assert login(client, "Target@example.com", "password123") == 429     # still cooling down, whatever the casing
    assert login(client, "other@example.com") == 401                     # other accounts are unaffected

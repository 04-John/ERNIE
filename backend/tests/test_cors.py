"""
A browser sends a CORS preflight before any request that isn't a plain GET/POST. If the server
doesn't allow the method, the browser blocks the call and the UI just says "could not connect".
Direct API calls (curl, tests) never reveal this, so every route's method is checked here.
"""

import pytest

from app.main import app

ORIGIN = "http://localhost:5173"          # the default allowed origin

SKIP = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def routes():
    out = set()
    for r in app.routes:
        if not hasattr(r, "methods") or r.path in SKIP:
            continue
        for m in r.methods - {"HEAD", "OPTIONS"}:
            out.add((m, r.path))
    return sorted(out)


@pytest.mark.parametrize("method,path", routes())
def test_browser_preflight_is_allowed_for_every_route(client, method, path):
    url = path.replace("{token}", "t").replace("{invite_id}", "i").replace("{member_id}", "m") \
              .replace("{channel_id}", "c").replace("{fintech_id}", "f")
    r = client.options(url, headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200, f"{method} {path} would be blocked in the browser ({r.status_code})"
    assert r.headers.get("access-control-allow-origin") == ORIGIN
    assert method in r.headers.get("access-control-allow-methods", "")


def test_other_origins_are_still_refused(client):
    r = client.options("/workspace/connection", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization"})
    assert r.status_code == 400 and "access-control-allow-origin" not in r.headers

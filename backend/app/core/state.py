"""
Per-workspace in-memory results.

`states` maps a state key to that workspace's pipeline output. The key is the
organization id for a connected workspace, or DEMO_KEY for the shared demo dataset.
Nothing here is shared between organizations except the read-only demo data.
"""

DEMO_KEY = "demo"

states: dict = {}


def empty_state() -> dict:
    return {
        "summary": {},
        "churn_scores": [],
        "monthly_volume": [],
        "regional_summary": [],
        "raw": {},
        "data_source": "none",
        "last_error": None,
        "last_refreshed": None,
        "refreshing": False,
    }

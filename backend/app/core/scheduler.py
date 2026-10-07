"""
Pipeline Scheduler
==================
Automatically re-runs the data pipeline every N hours
so the dashboard always shows fresh data.
"""

import asyncio
from datetime import datetime
from app.core.config import get_settings

settings = get_settings()


async def run_pipeline_job():
    """Single pipeline execution — called by the scheduler."""
    from app.core.state import app_state
    from app.services.churn_engine import run_churn_pipeline

    print(f"\n[Scheduler] Running pipeline refresh at {datetime.utcnow().isoformat()}")

    try:
        if settings.data_mode == "real":
            from app.services.blockradar import BlockradarClient
            from app.main import _normalize_addresses, _normalize_transactions

            client = BlockradarClient()
            addresses_raw    = await client.get_all_addresses()
            transactions_raw = await client.get_all_transactions(max_pages=20)

            addresses    = _normalize_addresses(addresses_raw, settings.blockradar_wallet_id)
            transactions = _normalize_transactions(transactions_raw)

            if len(addresses) == 0:
                raise Exception("No addresses returned")
        else:
            from app.services.simulator import run_simulation
            raw          = await asyncio.to_thread(run_simulation)
            addresses    = raw["addresses"]
            transactions = raw["transactions"]

        import pandas as pd
        kwargs = {"as_of": pd.Timestamp.now()} if settings.data_mode == "real" else {}
        results = await asyncio.to_thread(run_churn_pipeline, addresses, transactions, **kwargs)
        app_state.update(results)
        app_state["raw"] = {"addresses": addresses, "transactions": transactions}
        app_state["last_refreshed"] = datetime.utcnow().isoformat()

        print(f"[Scheduler] Pipeline complete. Next run in {settings.pipeline_schedule_hours}h")

    except Exception as e:
        print(f"[Scheduler] Pipeline failed: {e}")


async def start_scheduler():
    """Background task — runs pipeline on a loop."""
    interval_seconds = settings.pipeline_schedule_hours * 3600

    while True:
        await asyncio.sleep(interval_seconds)
        await run_pipeline_job()
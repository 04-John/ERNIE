"""
Pipeline Scheduler
==================
Re-runs the data pipeline every N hours so the dashboard stays fresh.
"""

import asyncio

from app.core.config import get_settings
from app.services.data_loader import refresh_state

settings = get_settings()


async def start_scheduler():
    """Background task — refreshes data on a loop; a failed run never kills the loop."""
    interval_seconds = max(settings.pipeline_schedule_hours, 0.05) * 3600

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await refresh_state("scheduler", force=True)
        except Exception as e:
            print(f"[scheduler] refresh failed: {e}")

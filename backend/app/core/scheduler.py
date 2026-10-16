"""
Pipeline Scheduler
==================
Re-syncs every connected workspace every N hours so dashboards stay fresh.
"""

import asyncio

from app.core.config import get_settings
from app.services.data_loader import refresh_all

settings = get_settings()


async def start_scheduler():
    """Background task. A failed run never kills the loop, and one workspace never affects another."""
    interval_seconds = max(settings.pipeline_schedule_hours, 0.05) * 3600

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await refresh_all("scheduler")
        except Exception as e:
            print(f"[scheduler] run failed: {type(e).__name__}")

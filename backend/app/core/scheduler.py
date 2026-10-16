"""
Pipeline Scheduler
==================
Re-syncs every connected workspace every N hours so dashboards stay fresh.
"""

import asyncio
import time

from app.core.config import get_settings
from app.services.data_loader import refresh_all

settings = get_settings()

# read by the public status endpoint
progress = {"started": time.time(), "last_run": None, "last_error": None}


async def start_scheduler():
    """Background task. A failed run never kills the loop, and one workspace never affects another."""
    interval_seconds = max(settings.pipeline_schedule_hours, 0.05) * 3600

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await refresh_all("scheduler")
            progress["last_error"] = None
        except Exception as e:
            progress["last_error"] = type(e).__name__
            print(f"[scheduler] run failed: {type(e).__name__}")
        progress["last_run"] = time.time()

"""
Register daily cron schedules for Flow 1 (ingest) and Flow 2 (sync).
Flow 3 (export) is triggered on-demand via the API — no schedule needed.

Run once:  make schedule
"""
import asyncio

import structlog
from temporalio.client import Client, Schedule, ScheduleActionStartWorkflow, ScheduleSpec
from temporalio.common import WorkflowIDReusePolicy

from config import settings
from workflows.ingest_pipeline import SatIngestWorkflow
from workflows.sync_pipeline import SatSyncWorkflow

log = structlog.get_logger()


async def main() -> None:
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)

    # Flow 1 — ingest daily at 01:00 UTC
    await client.create_schedule(
        "sat-ingest-daily",
        Schedule(
            action=ScheduleActionStartWorkflow(
                SatIngestWorkflow.run,
                id="sat-ingest-scheduled",
                task_queue=settings.temporal_task_queue,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
            ),
            spec=ScheduleSpec(cron_expressions=["0 1 * * *"]),
        ),
    )
    log.info("schedule registered", id="sat-ingest-daily", cron="0 1 * * *")

    # Flow 2 — sync 30 min after ingest at 01:30 UTC
    await client.create_schedule(
        "sat-sync-daily",
        Schedule(
            action=ScheduleActionStartWorkflow(
                SatSyncWorkflow.run,
                id="sat-sync-scheduled",
                task_queue=settings.temporal_task_queue,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
            ),
            spec=ScheduleSpec(cron_expressions=["30 1 * * *"]),
        ),
    )
    log.info("schedule registered", id="sat-sync-daily", cron="30 1 * * *")


if __name__ == "__main__":
    asyncio.run(main())

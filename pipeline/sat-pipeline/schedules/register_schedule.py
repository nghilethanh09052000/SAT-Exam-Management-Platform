import asyncio

import structlog
from temporalio.client import Client, Schedule, ScheduleActionStartWorkflow, ScheduleSpec
from temporalio.common import WorkflowIDReusePolicy

from config import settings
from workflows.sat_pipeline import SatPipelineWorkflow

log = structlog.get_logger()

SCHEDULE_ID = "sat-pipeline-daily"


async def main() -> None:
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)

    await client.create_schedule(
        SCHEDULE_ID,
        Schedule(
            action=ScheduleActionStartWorkflow(
                SatPipelineWorkflow.run,
                id="sat-pipeline-scheduled",
                task_queue=settings.temporal_task_queue,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
            ),
            spec=ScheduleSpec(
                cron_expressions=["0 2 * * *"],  # daily at 02:00 UTC
            ),
        ),
    )
    log.info("schedule registered", id=SCHEDULE_ID)


if __name__ == "__main__":
    asyncio.run(main())

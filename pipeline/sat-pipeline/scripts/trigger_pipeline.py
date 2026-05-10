import asyncio
import uuid

import structlog
from temporalio.client import Client

from config import settings
from workflows.sat_pipeline import SatPipelineWorkflow

log = structlog.get_logger()


async def main() -> None:
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)
    run_id = uuid.uuid4().hex[:8]
    handle = await client.start_workflow(
        SatPipelineWorkflow.run,
        id=f"sat-pipeline-manual-{run_id}",
        task_queue=settings.temporal_task_queue,
    )
    log.info("workflow started", workflow_id=handle.id, run_id=handle.result_run_id)
    result = await handle.result()
    log.info("workflow finished", result=result)


if __name__ == "__main__":
    asyncio.run(main())

"""
Manual one-shot trigger for any pipeline flow.

Usage:
  python scripts/trigger_pipeline.py ingest   # Flow 1
  python scripts/trigger_pipeline.py sync     # Flow 2
  python scripts/trigger_pipeline.py export   # Flow 3
"""
import asyncio
import sys
import uuid

import structlog
from temporalio.client import Client

from config import settings
from workflows.export_pipeline import SatExportWorkflow
from workflows.ingest_pipeline import SatIngestWorkflow
from workflows.sync_pipeline import SatSyncWorkflow

log = structlog.get_logger()

_WORKFLOWS = {
    "ingest": SatIngestWorkflow.run,
    "sync": SatSyncWorkflow.run,
    "export": SatExportWorkflow.run,
}


async def main(flow: str) -> None:
    if flow not in _WORKFLOWS:
        print(f"Unknown flow '{flow}'. Choose from: {', '.join(_WORKFLOWS)}")
        sys.exit(1)

    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)
    run_uid = uuid.uuid4().hex[:8]
    handle = await client.start_workflow(
        _WORKFLOWS[flow],
        id=f"sat-{flow}-manual-{run_uid}",
        task_queue=settings.temporal_task_queue,
    )
    log.info("workflow started", flow=flow, workflow_id=handle.id)
    result = await handle.result()
    log.info("workflow finished", flow=flow, result=result)


if __name__ == "__main__":
    flow = sys.argv[1] if len(sys.argv) > 1 else "ingest"
    asyncio.run(main(flow))

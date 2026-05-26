"""
HTTP API server — lets external web apps trigger Temporal workflows.

Endpoints:
  POST /api/v1/trigger/ingest   → start SatIngestWorkflow  (Flow 1)
  POST /api/v1/trigger/sync     → start SatSyncWorkflow    (Flow 2)
  POST /api/v1/trigger/export   → start SatExportWorkflow  (Flow 3)
  GET  /api/v1/status/{id}      → workflow status + result when done
"""
import uuid
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from temporalio.client import Client, WorkflowExecutionStatus
from temporalio.service import RPCError

from config import settings
from workflows.export_pipeline import SatExportWorkflow
from workflows.ingest_pipeline import SatIngestWorkflow
from workflows.sync_pipeline import SatSyncWorkflow

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# App lifecycle — Temporal client is created once and shared
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    app.state.temporal = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )
    log.info("temporal client connected", host=settings.temporal_host)
    yield


app = FastAPI(
    title="SAT Pipeline API",
    version="1.0.0",
    description="Trigger Temporal workflows from external web apps.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Optional bearer-token auth (skip if API_SECRET_KEY is empty)
# ---------------------------------------------------------------------------

async def check_auth(authorization: str = Header(default="")) -> None:
    if not settings.api_secret_key:
        return
    if authorization != f"Bearer {settings.api_secret_key}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class TriggerResponse(BaseModel):
    workflow_id: str
    run_id: str
    status_url: str


class StatusResponse(BaseModel):
    workflow_id: str
    status: str
    result: Any = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _temporal(request_app: Any) -> Client:
    return request_app.state.temporal


def _status_label(s: WorkflowExecutionStatus) -> str:
    return s.name  # RUNNING, COMPLETED, FAILED, etc.


# ---------------------------------------------------------------------------
# Trigger endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/trigger/ingest",
    response_model=TriggerResponse,
    dependencies=[Depends(check_auth)],
    summary="Trigger Flow 1 — scrape → BigQuery → dbt",
)
async def trigger_ingest(request: Any = None):
    from starlette.requests import Request as StarletteRequest  # avoid circular import
    # FastAPI injects the request via dependency, but we need app.state
    # Use a workaround via the app directly
    client: Client = app.state.temporal
    run_uid = uuid.uuid4().hex[:8]
    handle = await client.start_workflow(
        SatIngestWorkflow.run,
        id=f"sat-ingest-{run_uid}",
        task_queue=settings.temporal_task_queue,
    )
    return TriggerResponse(
        workflow_id=handle.id,
        run_id=handle.result_run_id or "",
        status_url=f"/api/v1/status/{handle.id}",
    )


@app.post(
    "/api/v1/trigger/sync",
    response_model=TriggerResponse,
    dependencies=[Depends(check_auth)],
    summary="Trigger Flow 2 — BigQuery → ClickHouse + App DB",
)
async def trigger_sync():
    client: Client = app.state.temporal
    run_uid = uuid.uuid4().hex[:8]
    handle = await client.start_workflow(
        SatSyncWorkflow.run,
        id=f"sat-sync-{run_uid}",
        task_queue=settings.temporal_task_queue,
    )
    return TriggerResponse(
        workflow_id=handle.id,
        run_id=handle.result_run_id or "",
        status_url=f"/api/v1/status/{handle.id}",
    )


@app.post(
    "/api/v1/trigger/export",
    response_model=TriggerResponse,
    dependencies=[Depends(check_auth)],
    summary="Trigger Flow 3 — generate DOCX ZIP (local)",
)
async def trigger_export():
    client: Client = app.state.temporal
    run_uid = uuid.uuid4().hex[:8]
    handle = await client.start_workflow(
        SatExportWorkflow.run,
        id=f"sat-export-{run_uid}",
        task_queue=settings.temporal_task_queue,
    )
    return TriggerResponse(
        workflow_id=handle.id,
        run_id=handle.result_run_id or "",
        status_url=f"/api/v1/status/{handle.id}",
    )


# ---------------------------------------------------------------------------
# Status / result endpoint
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/status/{workflow_id}",
    response_model=StatusResponse,
    dependencies=[Depends(check_auth)],
    summary="Poll workflow status. Returns result when COMPLETED.",
)
async def get_status(workflow_id: str):
    client: Client = app.state.temporal
    try:
        handle = client.get_workflow_handle(workflow_id)
        desc = await handle.describe()
        label = _status_label(desc.status)

        result = None
        if desc.status == WorkflowExecutionStatus.COMPLETED:
            result = await handle.result()

        return StatusResponse(workflow_id=workflow_id, status=label, result=result)

    except RPCError as exc:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {exc}") from exc


# ---------------------------------------------------------------------------
# Health check (no auth)
# ---------------------------------------------------------------------------

@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host=settings.api_host, port=settings.api_port, reload=False)

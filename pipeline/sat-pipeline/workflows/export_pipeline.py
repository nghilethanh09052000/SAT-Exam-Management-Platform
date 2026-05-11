"""Flow 3 — GCS (sat_clean snapshot) → DOCX per section → ZIP → GCS (signed URL)."""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.export.activities import generate_and_upload_export
    from activities.gcs.activities import fetch_questions_from_gcs
    from config import settings
    from models import ExportResult

_INFRA = RetryPolicy(maximum_attempts=3)
_EXPORT = RetryPolicy(maximum_attempts=2)


@workflow.defn
class SatExportWorkflow:
    """
    Triggered on-demand via the API server (external web app button).
    Reads the clean snapshot that Flow 1 wrote to GCS, builds a DOCX per
    section (Math / Reading & Writing), zips them, uploads to GCS, and
    returns a signed download URL.
    """

    @workflow.run
    async def run(self) -> ExportResult:
        # 1. Read clean snapshot from GCS — no BigQuery query needed
        questions = await workflow.execute_activity(
            fetch_questions_from_gcs,
            settings.gcs_clean_prefix,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_INFRA,
        )

        # 2. Generate DOCX per section → ZIP → upload to GCS → signed URL
        result: ExportResult = await workflow.execute_activity(
            generate_and_upload_export,
            questions,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_EXPORT,
        )

        return result

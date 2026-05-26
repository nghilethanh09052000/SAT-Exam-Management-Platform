"""Flow 3 — BigQuery (sat_clean) → DOCX per section → ZIP (local)."""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.bigquery.activities import fetch_clean_questions_from_bigquery
    from activities.export.activities import generate_and_upload_export
    from models import ExportResult

_INFRA = RetryPolicy(maximum_attempts=3)
_EXPORT = RetryPolicy(maximum_attempts=2)


@workflow.defn
class SatExportWorkflow:
    """
    Triggered on-demand via the API server (external web app button).
    Queries sat_clean from BigQuery, builds a DOCX per section
    (Math / Reading & Writing), zips them, and returns the local ZIP path.
    """

    @workflow.run
    async def run(self) -> ExportResult:
        # 1. Fetch clean questions directly from BigQuery
        questions = await workflow.execute_activity(
            fetch_clean_questions_from_bigquery,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_INFRA,
        )

        # 2. Generate DOCX per section → ZIP → local file
        result: ExportResult = await workflow.execute_activity(
            generate_and_upload_export,
            questions,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_EXPORT,
        )

        return result

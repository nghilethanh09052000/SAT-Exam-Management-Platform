"""Flow 2 — BigQuery (sat_clean) → ClickHouse + App DB."""
import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.app_db.activities import ensure_app_db_schema, sync_questions_to_app_db
    from activities.bigquery.activities import fetch_clean_questions_from_bigquery
    from activities.clickhouse.activities import create_clickhouse_tables, sync_questions_to_clickhouse

_INFRA = RetryPolicy(maximum_attempts=3)
_SYNC = RetryPolicy(maximum_attempts=3)


@workflow.defn
class SatSyncWorkflow:
    """Pull clean questions from BigQuery and sync them to ClickHouse and App DB."""

    @workflow.run
    async def run(self) -> dict[str, object]:
        # 1. Ensure target schemas exist
        await asyncio.gather(
            workflow.execute_activity(
                create_clickhouse_tables,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_INFRA,
            ),
            workflow.execute_activity(
                ensure_app_db_schema,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_INFRA,
            ),
        )

        # 2. Fetch clean data from BigQuery
        questions = await workflow.execute_activity(
            fetch_clean_questions_from_bigquery,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_INFRA,
        )

        # 3. Sync to ClickHouse and App DB in parallel
        ch_result, app_result = await asyncio.gather(
            workflow.execute_activity(
                sync_questions_to_clickhouse,
                questions,
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=_SYNC,
            ),
            workflow.execute_activity(
                sync_questions_to_app_db,
                questions,
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=_SYNC,
            ),
        )

        return {
            "questions_synced": len(questions),
            "clickhouse": ch_result.model_dump(),
            "app_db": app_result.model_dump(),
        }

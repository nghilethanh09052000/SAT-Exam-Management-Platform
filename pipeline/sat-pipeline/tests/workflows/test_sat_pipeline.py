from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from models import DbtRunResult, RawQuestion, SyncResult
from workflows.sat_pipeline import SatPipelineWorkflow

FAKE_QUESTION = RawQuestion(
    question_id="abc123",
    source="bluebooky",
    source_url="https://bluebooky.com/question/1",
    section="Math",
    domain="Algebra",
    difficulty="Medium",
    question_text="What is 2 + 2?",
    choices={"A": "3", "B": "4", "C": "5", "D": "6"},
    correct_answer="B",
    explanation="2 + 2 = 4",
    scraped_at=datetime.utcnow(),
)

FAKE_DBT_OK = DbtRunResult(success=True, models_run=["sat_questions"], tests_passed=3, tests_failed=0, elapsed_seconds=1.0)
FAKE_SYNC_OK = SyncResult(rows_inserted=1, rows_updated=0, rows_failed=0, target="clickhouse")
FAKE_APP_OK = SyncResult(rows_inserted=1, rows_updated=0, rows_failed=0, target="app_db")


@pytest.mark.asyncio
async def test_sat_pipeline_happy_path() -> None:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue="test-queue",
            workflows=[SatPipelineWorkflow],
            activities=[
                _make_activity("create_clickhouse_tables", None),
                _make_activity("ensure_app_db_schema", None),
                _make_activity("get_bluebooky_total_pages", 1),
                _make_activity("get_satgpt_total_pages", 1),
                _make_activity("scrape_bluebooky_listing_page", ["https://bluebooky.com/question/1"]),
                _make_activity("scrape_satgpt_listing_page", ["https://satgpt.xyz/question/1"]),
                _make_activity("scrape_bluebooky_question", FAKE_QUESTION),
                _make_activity("scrape_satgpt_question", FAKE_QUESTION),
                _make_activity("sync_questions_to_clickhouse", FAKE_SYNC_OK),
                _make_activity("dbt_run_models", FAKE_DBT_OK),
                _make_activity("dbt_test_models", FAKE_DBT_OK),
                _make_activity("sync_questions_to_app_db", FAKE_APP_OK),
            ],
        ):
            result = await env.client.execute_workflow(
                SatPipelineWorkflow.run,
                id="test-pipeline",
                task_queue="test-queue",
            )
            assert result["questions_scraped"] == 2
            assert result["dbt_run"]["success"] is True


def _make_activity(name: str, return_value: object):
    """Create a stub activity function with the given name."""
    import temporalio.activity as act

    async def stub(*args, **kwargs):  # type: ignore[no-untyped-def]
        return return_value

    stub.__name__ = name
    stub.__qualname__ = name
    return act.defn(stub)

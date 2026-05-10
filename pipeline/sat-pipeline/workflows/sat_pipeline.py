from datetime import timedelta

import structlog
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.app_db.activities import ensure_app_db_schema, sync_questions_to_app_db
    from activities.clickhouse.activities import create_clickhouse_tables, sync_questions_to_clickhouse
    from activities.dbt.activities import dbt_run_models, dbt_test_models
    from activities.scraper.bluebooky import (
        get_bluebooky_total_pages,
        scrape_bluebooky_listing_page,
        scrape_bluebooky_question,
    )
    from activities.scraper.satgpt import (
        get_satgpt_total_pages,
        scrape_satgpt_listing_page,
        scrape_satgpt_question,
    )
    from models import RawQuestion

log = structlog.get_logger()

_SCRAPER_RETRY = RetryPolicy(maximum_attempts=5)
_SYNC_RETRY = RetryPolicy(maximum_attempts=3)
_DBT_RETRY = RetryPolicy(maximum_attempts=3)


@workflow.defn
class SatPipelineWorkflow:
    @workflow.run
    async def run(self) -> dict[str, object]:
        # 1. Ensure infrastructure
        await workflow.execute_activity(
            create_clickhouse_tables,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_SYNC_RETRY,
        )
        await workflow.execute_activity(
            ensure_app_db_schema,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_SYNC_RETRY,
        )

        # 2. Collect all question URLs from both sources in parallel
        bb_pages, sg_pages = await workflow.gather(
            workflow.execute_activity(
                get_bluebooky_total_pages,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_SCRAPER_RETRY,
            ),
            workflow.execute_activity(
                get_satgpt_total_pages,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_SCRAPER_RETRY,
            ),
        )

        all_urls: list[tuple[str, str]] = []

        bb_listing_tasks = [
            workflow.execute_activity(
                scrape_bluebooky_listing_page,
                page_number,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(minutes=1),
                retry_policy=_SCRAPER_RETRY,
            )
            for page_number in range(1, bb_pages + 1)
        ]
        sg_listing_tasks = [
            workflow.execute_activity(
                scrape_satgpt_listing_page,
                page_number,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(minutes=1),
                retry_policy=_SCRAPER_RETRY,
            )
            for page_number in range(1, sg_pages + 1)
        ]

        for urls in await workflow.gather(*bb_listing_tasks):
            all_urls.extend(("bluebooky", u) for u in urls)
        for urls in await workflow.gather(*sg_listing_tasks):
            all_urls.extend(("satgpt", u) for u in urls)

        # 3. Scrape question details
        questions: list[RawQuestion] = []
        detail_tasks = []
        for source, url in all_urls:
            activity_fn = (
                scrape_bluebooky_question if source == "bluebooky" else scrape_satgpt_question
            )
            detail_tasks.append(
                workflow.execute_activity(
                    activity_fn,
                    url,
                    start_to_close_timeout=timedelta(minutes=3),
                    heartbeat_timeout=timedelta(minutes=1),
                    retry_policy=_SCRAPER_RETRY,
                )
            )
        questions = list(await workflow.gather(*detail_tasks))

        # 4. Sync to ClickHouse raw layer
        ch_result = await workflow.execute_activity(
            sync_questions_to_clickhouse,
            questions,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_SYNC_RETRY,
        )

        # 5. dbt: transform raw → clean
        dbt_run = await workflow.execute_activity(
            dbt_run_models,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_DBT_RETRY,
        )
        if not dbt_run.success:
            raise RuntimeError("dbt run failed — see activity logs")

        # 6. dbt tests
        dbt_test = await workflow.execute_activity(
            dbt_test_models,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_DBT_RETRY,
        )
        if not dbt_test.success:
            raise RuntimeError(f"dbt tests failed: {dbt_test.tests_failed} failures")

        # 7. Sync clean data to app DB
        app_result = await workflow.execute_activity(
            sync_questions_to_app_db,
            questions,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_SYNC_RETRY,
        )

        return {
            "questions_scraped": len(questions),
            "clickhouse": ch_result.model_dump(),
            "dbt_run": dbt_run.model_dump(),
            "dbt_test": dbt_test.model_dump(),
            "app_db": app_result.model_dump(),
        }

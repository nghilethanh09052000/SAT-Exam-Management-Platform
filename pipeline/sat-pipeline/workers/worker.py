import asyncio

import structlog
from temporalio.client import Client
from temporalio.worker import Worker

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
from config import settings
from workflows.sat_pipeline import SatPipelineWorkflow

log = structlog.get_logger()


async def main() -> None:
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)
    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[SatPipelineWorkflow],
        activities=[
            create_clickhouse_tables,
            sync_questions_to_clickhouse,
            ensure_app_db_schema,
            sync_questions_to_app_db,
            dbt_run_models,
            dbt_test_models,
            get_bluebooky_total_pages,
            scrape_bluebooky_listing_page,
            scrape_bluebooky_question,
            get_satgpt_total_pages,
            scrape_satgpt_listing_page,
            scrape_satgpt_question,
        ],
    )
    log.info("worker starting", task_queue=settings.temporal_task_queue)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())

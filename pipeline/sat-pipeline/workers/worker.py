import asyncio

import structlog
from temporalio.client import Client
from temporalio.worker import Worker

from activities.app_db.activities import ensure_app_db_schema, sync_questions_to_app_db
from activities.bigquery.activities import (
    ensure_bigquery_datasets,
    fetch_clean_questions_from_bigquery,
    insert_questions_to_bigquery,
)
from activities.clickhouse.activities import create_clickhouse_tables, sync_questions_to_clickhouse
from activities.dbt.activities import dbt_run_models, dbt_test_models
from activities.export.activities import generate_and_upload_export
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
from workflows.export_pipeline import SatExportWorkflow
from workflows.ingest_pipeline import SatIngestWorkflow
from workflows.sync_pipeline import SatSyncWorkflow

log = structlog.get_logger()


async def main() -> None:
    client = await Client.connect(settings.temporal_host, namespace=settings.temporal_namespace)
    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[
            SatIngestWorkflow,   # Flow 1: scrape → BigQuery → dbt
            SatSyncWorkflow,     # Flow 2: BigQuery → ClickHouse + App DB
            SatExportWorkflow,   # Flow 3: BigQuery → DOCX ZIP (local)
        ],
        activities=[
            # BigQuery
            ensure_bigquery_datasets,
            insert_questions_to_bigquery,
            fetch_clean_questions_from_bigquery,
            # dbt
            dbt_run_models,
            dbt_test_models,
            # ClickHouse
            create_clickhouse_tables,
            sync_questions_to_clickhouse,
            # App DB
            ensure_app_db_schema,
            sync_questions_to_app_db,
            # Export
            generate_and_upload_export,
            # Scrapers
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

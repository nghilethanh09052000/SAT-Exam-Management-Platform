"""Flow 1 — Scrape → GCS → BigQuery → dbt (BigQuery)."""
import uuid
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.bigquery.activities import ensure_bigquery_datasets, export_clean_to_gcs, load_gcs_to_bigquery
    from activities.dbt.activities import dbt_run_models, dbt_test_models
    from activities.gcs.activities import upload_questions_to_gcs
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

_SCRAPER = RetryPolicy(maximum_attempts=5)
_INFRA = RetryPolicy(maximum_attempts=3)
_DBT = RetryPolicy(maximum_attempts=3)


@workflow.defn
class SatIngestWorkflow:
    """Scrape → GCS (raw NDJSON) → BigQuery (sat_raw) → dbt → BigQuery (sat_clean)."""

    @workflow.run
    async def run(self) -> dict[str, object]:
        run_id = workflow.info().run_id[:8]

        # 1. Ensure BigQuery datasets exist
        await workflow.execute_activity(
            ensure_bigquery_datasets,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_INFRA,
        )

        # 2. Get total page counts from both sources in parallel
        bb_pages, sg_pages = await workflow.gather(
            workflow.execute_activity(
                get_bluebooky_total_pages,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_SCRAPER,
            ),
            workflow.execute_activity(
                get_satgpt_total_pages,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=_SCRAPER,
            ),
        )

        # 3. Scrape listing pages for all question URLs
        bb_listing = [
            workflow.execute_activity(
                scrape_bluebooky_listing_page,
                n,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(minutes=1),
                retry_policy=_SCRAPER,
            )
            for n in range(1, bb_pages + 1)
        ]
        sg_listing = [
            workflow.execute_activity(
                scrape_satgpt_listing_page,
                n,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(minutes=1),
                retry_policy=_SCRAPER,
            )
            for n in range(1, sg_pages + 1)
        ]

        all_urls: list[tuple[str, str]] = []
        for urls in await workflow.gather(*bb_listing):
            all_urls.extend(("bluebooky", u) for u in urls)
        for urls in await workflow.gather(*sg_listing):
            all_urls.extend(("satgpt", u) for u in urls)

        # 4. Scrape question detail pages
        detail_tasks = [
            workflow.execute_activity(
                scrape_bluebooky_question if source == "bluebooky" else scrape_satgpt_question,
                url,
                start_to_close_timeout=timedelta(minutes=3),
                heartbeat_timeout=timedelta(minutes=1),
                retry_policy=_SCRAPER,
            )
            for source, url in all_urls
        ]
        questions: list[RawQuestion] = list(await workflow.gather(*detail_tasks))

        # 5. Upload raw NDJSON to GCS
        gcs_uri = await workflow.execute_activity(
            upload_questions_to_gcs,
            args=[questions, run_id],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_INFRA,
        )

        # 6. Load GCS → BigQuery sat_raw
        rows_loaded = await workflow.execute_activity(
            load_gcs_to_bigquery,
            gcs_uri,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_INFRA,
        )

        # 7. dbt: sat_raw → sat_clean (BigQuery)
        dbt_run = await workflow.execute_activity(
            dbt_run_models,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_DBT,
        )
        if not dbt_run.success:
            raise RuntimeError("dbt run failed — see activity logs")

        # 8. dbt tests
        dbt_test = await workflow.execute_activity(
            dbt_test_models,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_DBT,
        )
        if not dbt_test.success:
            raise RuntimeError(f"dbt tests failed: {dbt_test.tests_failed} failure(s)")

        # 9. Export sat_clean → GCS (fixed path, overwrites previous snapshot)
        #    Flow 3 (export) reads from here — no BigQuery query needed at export time.
        clean_gcs_uri = await workflow.execute_activity(
            export_clean_to_gcs,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
            retry_policy=_INFRA,
        )

        return {
            "questions_scraped": len(questions),
            "raw_gcs_uri": gcs_uri,
            "clean_gcs_uri": clean_gcs_uri,
            "bq_rows_loaded": rows_loaded,
            "dbt_run": dbt_run.model_dump(),
            "dbt_test": dbt_test.model_dump(),
        }

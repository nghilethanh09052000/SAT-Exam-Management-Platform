# SAT Pipeline — Claude Code Guide

## What this project is

Standalone Python ETL pipeline that scrapes SAT practice questions from external sites, stores them in ClickHouse, transforms them with dbt, and syncs the clean layer to a PostgreSQL app database. Orchestrated by Temporal for durable retries and daily scheduling. **Zero dependency on the Next.js web app in the parent repo.**

## Architecture at a glance

Three independent Temporal workflows:

```
Flow 1 — Ingest:  Playwright scrapers → GCS (NDJSON) → BigQuery (sat_raw) → dbt → BigQuery (sat_clean)
Flow 2 — Sync:    BigQuery (sat_clean) → ClickHouse + PostgreSQL app_db
Flow 3 — Export:  BigQuery (sat_clean) → DOCX per section → ZIP → GCS (signed URL)
```

Flow 3 is triggered on-demand by an external web app via the FastAPI server (`api/server.py`).

## Project layout

```
config/settings.py                    # Single source of truth for all env vars
models/sat.py                         # RawQuestion, DbtRunResult, SyncResult, ExportResult

workflows/
  ingest_pipeline.py                  # Flow 1: scrape → GCS → BigQuery → dbt
  sync_pipeline.py                    # Flow 2: BigQuery → ClickHouse + App DB
  export_pipeline.py                  # Flow 3: BigQuery → DOCX ZIP → GCS

activities/
  scraper/bluebooky.py                # Playwright scraper for bluebooky.com
  scraper/satgpt.py                   # Playwright scraper for satgpt.xyz (login required)
  gcs/activities.py                   # Upload NDJSON + files to GCS, generate signed URLs
  bigquery/activities.py              # Ensure datasets, GCS→BQ load, fetch clean questions
  dbt/activities.py                   # dbt run / dbt test via subprocess
  clickhouse/activities.py            # DDL + bulk insert (Flow 2)
  app_db/activities.py                # Upsert into PostgreSQL sat_questions (Flow 2)
  export/activities.py                # Build DOCX per section, ZIP, upload to GCS (Flow 3)

api/server.py                         # FastAPI — external apps call this to trigger Flow 3
workers/worker.py                     # Registers all three workflows + all activities
schedules/register_schedule.py        # Daily cron: ingest 01:00 UTC, sync 01:30 UTC
scripts/trigger_pipeline.py           # Manual trigger: python scripts/trigger_pipeline.py <flow>

dbt/
  profiles.yml                        # bigquery (default) + clickhouse targets
  models/sat_clean/sat_questions.sql  # Dedup + normalise — BigQuery-compatible SQL
```

## Key conventions

- **All config comes from `.env`** via `config/settings.py`. Never hard-code URLs, credentials, or connection strings anywhere else.
- **Activity functions are always `async def`** even when the underlying work is synchronous (ClickHouse client, subprocess). This is a Temporal requirement.
- **Heartbeats on long activities** — scraper activities call `activity.heartbeat()` per page/URL so Temporal knows they're alive.
- **Idempotent writes** — ClickHouse inserts are append-only (dedup happens in dbt). PostgreSQL upserts use `ON CONFLICT (question_id) DO UPDATE`.
- **`question_id` is a SHA-256 hash** of `source + url + question_text` truncated to 16 hex chars. Never change this formula without re-seeding.
- **dbt runs as a subprocess** (`subprocess.run(["dbt", ...])`). The dbt profile reads ClickHouse credentials from env vars at runtime.
- **Scraper selectors need real-site verification.** The CSS selectors in `bluebooky.py` and `satgpt.py` are based on common patterns and must be validated against the live sites before the pipeline is considered working.

## Running locally

```bash
make up        # docker compose up (Temporal, ClickHouse, PostgreSQL)
make install   # poetry install + playwright install chromium
cp .env.example .env   # fill in SATGPT_EMAIL + SATGPT_PASSWORD
make worker    # terminal 1 — starts the Temporal worker
make run       # terminal 2 — triggers one full pipeline run
```

Temporal UI: http://localhost:8080

## Adding a new scraper source

1. Create `activities/scraper/<source_name>.py` with three `@activity.defn` functions:
   - `get_<source>_total_pages() -> int`
   - `scrape_<source>_listing_page(page_number: int) -> list[str]`
   - `scrape_<source>_question(url: str) -> RawQuestion`
2. Register all three in `workers/worker.py` under the `activities=[...]` list.
3. Add the parallel listing + detail scraping steps in `workflows/sat_pipeline.py` following the existing Bluebooky/SatGPT pattern.
4. Update `RawQuestion.source` literal type in `models/sat.py`.

## Temporal retry policy reference

| Activity | Timeout | Max attempts |
|---|---|---|
| Scraper listing page | 5 min | 5 |
| Scraper detail page | 3 min | 5 |
| ClickHouse sync | 10 min | 3 |
| dbt run | 15 min | 3 |
| dbt test | 10 min | 3 — workflow **fails** if tests fail |
| App DB sync | 10 min | 3 |

## Testing

```bash
make test          # runs pytest tests/
make lint          # ruff + mypy
```

Temporal workflow tests use `WorkflowEnvironment.start_time_skipping()` so they complete instantly without real infrastructure. Activity unit tests mock Playwright at the `async_playwright` import level.

## What NOT to do

- Do not import anything from the parent Next.js app.
- Do not put credentials in `profiles.yml` — dbt reads them from env vars.
- Do not skip `dbt_test_models` in the workflow even in dev; it is the only guard against bad data reaching the app DB.
- Do not add synchronous blocking calls directly inside `@workflow.defn` methods — all I/O must go through activities.

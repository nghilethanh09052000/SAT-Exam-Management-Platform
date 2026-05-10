# SAT Pipeline

Standalone Temporal-based ETL pipeline that scrapes SAT practice questions, cleans them with dbt, and loads them into the app database. Completely independent of the Next.js web app.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────┐
│                      Temporal Workflow                           │
│                                                                  │
│  [Scraper] ──► [ClickHouse raw] ──► [dbt clean] ──► [App DB]   │
└──────────────────────────────────────────────────────────────────┘
```

| Stage | Tool | Purpose |
|-------|------|---------|
| Orchestration | Temporal (Python SDK) | Durable workflow, retries, scheduling |
| Scraping | Playwright + BeautifulSoup | JS-rendered SAT question sites |
| Raw storage | ClickHouse | Append-only raw layer |
| Transformation | dbt-clickhouse | Dedup, normalise → clean layer |
| App sync | PostgreSQL (asyncpg) | What the Next.js SAT app reads |

### Sources

| Site | Notes |
|------|-------|
| [bluebooky.com](https://bluebooky.com) | Public, no login required |
| [satgpt.xyz/dashboard](https://www.satgpt.xyz/dashboard) | Requires account login |

---

## Quick start

### Prerequisites

- Docker + Docker Compose
- Python 3.11+
- [Poetry](https://python-poetry.org/docs/#installation)

### 1. Start infrastructure

```bash
make up
```

Starts Temporal, Temporal UI, ClickHouse, and PostgreSQL in Docker.

### 2. Install Python dependencies

```bash
make install
```

Installs all packages via Poetry and downloads the Playwright Chromium browser.

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```bash
SATGPT_EMAIL=your@email.com
SATGPT_PASSWORD=yourpassword
```

All other values work out of the box against the Docker services.

### 4. Run the pipeline

```bash
# Terminal 1 — start the worker
make worker

# Terminal 2 — trigger a single run
make run
```

View live progress in the Temporal UI at **http://localhost:8080**.

---

## All commands

### Infrastructure

```bash
make up      # docker compose up -d
make down    # docker compose down
make logs    # follow all service logs
```

### Python

```bash
make install   # poetry install + playwright install chromium
make lint      # ruff check + mypy
make test      # pytest tests/
```

### Pipeline

```bash
make worker    # start the Temporal worker (keep running)
make run       # manually trigger one full pipeline run
make schedule  # register the daily 02:00 UTC cron schedule
```

### dbt

```bash
make dbt-run    # dbt run  --select sat_clean
make dbt-test   # dbt test --select sat_clean
```

---

## Project structure

```
sat-pipeline/
├── workflows/
│   └── sat_pipeline.py          # End-to-end Temporal workflow
├── activities/
│   ├── scraper/
│   │   ├── bluebooky.py         # Scraper for bluebooky.com
│   │   └── satgpt.py            # Scraper for satgpt.xyz
│   ├── clickhouse/
│   │   └── activities.py        # DDL + bulk insert (raw layer)
│   ├── dbt/
│   │   └── activities.py        # dbt run / dbt test via subprocess
│   └── app_db/
│       └── activities.py        # Upsert into PostgreSQL
├── workers/
│   └── worker.py                # Registers all workflows + activities
├── schedules/
│   └── register_schedule.py     # One-time daily cron setup
├── scripts/
│   └── trigger_pipeline.py      # Manual trigger
├── models/
│   └── sat.py                   # Shared Pydantic models
├── config/
│   └── settings.py              # All config via pydantic-settings
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   └── models/sat_clean/
│       ├── sources.yml
│       └── sat_questions.sql    # Dedup + normalise raw → clean
├── tests/
│   ├── workflows/               # Temporal WorkflowEnvironment tests
│   └── activities/              # Scraper unit tests (mocked Playwright)
├── docker-compose.yml
├── Makefile
├── pyproject.toml
└── .env.example
```

---

## Data model

### `RawQuestion` — produced by scrapers

| Field | Type | Notes |
|-------|------|-------|
| `question_id` | `str` | SHA-256 hash of source + URL + text (16 hex chars) |
| `source` | `str` | `"bluebooky"` or `"satgpt"` |
| `source_url` | `str` | Page the question was scraped from |
| `section` | `str` | `"Math"` or `"Reading & Writing"` |
| `domain` | `str` | e.g. `"Algebra"`, `"Information and Ideas"` |
| `difficulty` | `str \| None` | `"Easy"`, `"Medium"`, `"Hard"` |
| `question_text` | `str` | Full question text |
| `choices` | `dict` | `{"A": "...", "B": "...", ...}` |
| `correct_answer` | `str` | e.g. `"B"` |
| `explanation` | `str \| None` | Optional explanation text |
| `scraped_at` | `datetime` | UTC timestamp |

### ClickHouse tables

| Table | Description |
|-------|-------------|
| `sat_raw.sat_questions_raw` | Append-only raw insert from scrapers |
| `sat_clean.sat_questions` | Deduplicated, normalised — written by dbt |

### PostgreSQL table

`sat_questions` — upserted by `sync_questions_to_app_db`, primary key on `question_id`.

---

## Workflow execution order

```
SatPipelineWorkflow.run()
│
├── 1. create_clickhouse_tables        idempotent DDL
├── 2. ensure_app_db_schema            idempotent DDL
│
├── 3. get_bluebooky_total_pages  ─┐
├── 4. get_satgpt_total_pages     ─┘  parallel
│
├── 5. scrape_*_listing_page(n)        per page, collects all question URLs
│
├── 6. scrape_*_question(url)          per URL → RawQuestion
│
├── 7. sync_questions_to_clickhouse    bulk insert raw layer
│
├── 8. dbt_run_models                  raw → clean transform
│
├── 9. dbt_test_models                 validate clean layer (fails workflow on error)
│
└── 10. sync_questions_to_app_db       upsert into PostgreSQL
```

---

## Retry & timeout policy

| Activity | Timeout | Max attempts |
|----------|---------|--------------|
| Scraper listing page | 5 min | 5 |
| Scraper detail page | 3 min | 5 |
| ClickHouse sync | 10 min | 3 |
| dbt run | 15 min | 3 |
| dbt test | 10 min | 3 |
| App DB sync | 10 min | 3 |

---

## Infrastructure services

| Service | Image | Port |
|---------|-------|------|
| Temporal | `temporalio/auto-setup:1.24` | `7233` |
| Temporal UI | `temporalio/ui:2.26` | `8080` |
| ClickHouse | `clickhouse/clickhouse-server:24.4` | `8123`, `9000` |
| PostgreSQL | `postgres:16` | `5432` |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_HOST` | `localhost:7233` | Temporal server address |
| `TEMPORAL_TASK_QUEUE` | `sat-pipeline` | Worker task queue name |
| `BLUEBOOKY_BASE_URL` | `https://bluebooky.com` | Bluebooky base URL |
| `SATGPT_BASE_URL` | `https://www.satgpt.xyz` | SatGPT base URL |
| `SATGPT_EMAIL` | — | **Required.** SatGPT login email |
| `SATGPT_PASSWORD` | — | **Required.** SatGPT login password |
| `SCRAPER_CONCURRENCY` | `3` | Max parallel scraper tasks |
| `SCRAPER_DELAY_SECONDS` | `1.5` | Polite delay between requests |
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse hostname |
| `CLICKHOUSE_DB` | `sat_raw` | ClickHouse raw database |
| `APP_DB_DSN` | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `DBT_PROJECT_DIR` | `./dbt` | Path to dbt project |
| `DBT_TARGET` | `dev` | dbt target profile |

See [.env.example](.env.example) for the full list.

---

## Notes

- The Playwright CSS selectors in `activities/scraper/` are based on common site patterns. Inspect the live sites and update selectors if scraping returns empty fields.
- ClickHouse raw inserts are append-only. Deduplication happens exclusively in the dbt model using `ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY scraped_at DESC)`.
- The daily schedule runs at **02:00 UTC**. Run `make schedule` once to register it; subsequent runs are automatic.

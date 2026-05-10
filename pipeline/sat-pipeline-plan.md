# SAT Pipeline — Project Plan

Standalone Temporal-based ETL pipeline for the SAT Exam Management Platform.  
Completely independent of the Next.js web app.

---

## Architecture Overview

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
| Raw storage | ClickHouse (Docker) | Append-only raw layer |
| Transformation | dbt-clickhouse | Clean, deduplicate, normalise |
| App sync | PostgreSQL (asyncpg) | What the Next.js SAT app reads |

---

## Source Websites

| Site | URL | Notes |
|------|-----|-------|
| Bluebooky | https://bluebooky.com/ | SAT practice questions |
| SatGPT | https://www.satgpt.xyz/dashboard | Requires login |

Both sites are JS-rendered → **Playwright** is required (not plain httpx).  
Each site gets its own activity file under `activities/scraper/`.

---

## Folder Structure

```
sat-pipeline/
│
├── workflows/
│   └── sat_pipeline.py              # Main end-to-end Temporal workflow
│
├── activities/
│   ├── scraper/
│   │   ├── bluebooky.py             # Scraper activities for bluebooky.com
│   │   └── satgpt.py                # Scraper activities for satgpt.xyz
│   ├── dbt/
│   │   └── activities.py            # dbt_run_models, dbt_test_models
│   ├── clickhouse/
│   │   └── activities.py            # create_tables, sync_to_clickhouse
│   └── app_db/
│       └── activities.py            # sync_to_app_db (upsert)
│
├── workers/
│   └── worker.py                    # Registers all workflows + activities
│
├── schedules/
│   └── register_schedule.py         # One-time cron schedule setup
│
├── scripts/
│   └── trigger_pipeline.py          # Manually trigger a run
│
├── models/
│   └── sat.py                       # Shared Pydantic models
│
├── config/
│   └── settings.py                  # pydantic-settings, reads .env
│
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   └── models/
│       └── sat_clean/
│           ├── sources.yml          # points to sat_raw.sat_questions_raw
│           └── sat_questions.sql    # dedup + normalise → sat_clean
│
├── tests/
│   ├── workflows/
│   │   └── test_sat_pipeline.py     # Temporal WorkflowEnvironment tests
│   └── activities/
│       └── test_scraper.py
│
├── docker-compose.yml               # Temporal, ClickHouse, PostgreSQL
├── Makefile                         # Dev commands (see below)
├── pyproject.toml                   # Poetry deps
├── .env.example
└── README.md
```

---

## Workflow Execution Order

```
SatPipelineWorkflow.run()
│
├── 1. create_clickhouse_tables            (idempotent DDL, safe to re-run)
│
├── 2. Bluebooky: get_total_pages
│       └── scrape_listing_page(n)  ─┐
│                                    ├──► collect all question URLs
├── 3. SatGPT: get_total_pages       │
│       └── scrape_listing_page(n)  ─┘
│
├── 4. scrape_question_detail(url)         (per URL → RawQuestion)
│
├── 5. sync_questions_to_clickhouse        (bulk insert raw layer)
│
├── 6. dbt_run_models                      (raw → clean transform)
│
├── 7. dbt_test_models                     (validate clean layer)
│
└── 8. sync_questions_to_app_db            (upsert into PostgreSQL)
```

---

## Data Models  (`models/sat.py`)

```
RawQuestion
├── question_id: str          # stable hash from source content
├── source: str               # "bluebooky" | "satgpt"
├── source_url: str
├── section: str              # "Math" | "Reading & Writing"
├── domain: str               # "Algebra" | "Information and Ideas" | …
├── difficulty: str | None    # "Easy" | "Medium" | "Hard"
├── question_text: str
├── choices: dict             # {"A": "…", "B": "…", …}
├── correct_answer: str
├── explanation: str | None
└── scraped_at: datetime

DbtRunResult
├── success: bool
├── models_run: list[str]
├── tests_passed: int
├── tests_failed: int
└── elapsed_seconds: float

SyncResult
├── rows_inserted: int
├── rows_updated: int
├── rows_failed: int
└── target: str               # "clickhouse" | "app_db"
```

---

## Key Dependencies  (`pyproject.toml`)

```toml
[tool.poetry.dependencies]
python             = "^3.11"
temporalio         = "^1.7"
playwright         = "^1.44"
beautifulsoup4     = "^4.12"
dbt-core           = "^1.8"
dbt-clickhouse     = "^1.8"
clickhouse-connect = "^0.7"
sqlalchemy         = "^2.0"
asyncpg            = "^0.29"
pydantic           = "^2.7"
pydantic-settings  = "^2.2"
structlog          = "^24.1"

[tool.poetry.group.dev.dependencies]
pytest             = "^8.2"
pytest-asyncio     = "^0.23"
ruff               = "^0.4"
mypy               = "^1.10"
```

---

## Infrastructure  (`docker-compose.yml`)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `temporal` | `temporalio/auto-setup:1.24` | `7233` | Temporal server (sqlite dev mode) |
| `temporal-ui` | `temporalio/ui:2.26` | `8080` | Temporal web UI |
| `clickhouse` | `clickhouse/clickhouse-server:24.4` | `8123`, `9000` | Raw + clean data warehouse |
| `postgres` | `postgres:16` | `5432` | App DB (matches Next.js app schema) |

---

## Makefile Commands

```makefile
## Infrastructure
make up           # docker compose up -d  (start all services)
make down         # docker compose down
make logs         # follow all service logs

## Python env
make install      # poetry install + playwright install chromium
make lint         # ruff check + mypy
make test         # pytest tests/

## Pipeline
make worker       # start the Temporal worker
make run          # manually trigger one pipeline run
make schedule     # register the daily cron schedule

## dbt
make dbt-run      # dbt run  --select sat_clean
make dbt-test     # dbt test --select sat_clean
```

---

## Environment Variables  (`.env.example`)

```bash
# Temporal
TEMPORAL_HOST=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=sat-pipeline

# Scraper — Bluebooky
BLUEBOOKY_BASE_URL=https://bluebooky.com

# Scraper — SatGPT (requires login)
SATGPT_BASE_URL=https://www.satgpt.xyz
SATGPT_EMAIL=your@email.com
SATGPT_PASSWORD=yourpassword

# Shared scraper settings
SCRAPER_CONCURRENCY=3
SCRAPER_DELAY_SECONDS=1.5

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DB=sat_raw
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# App DB — PostgreSQL (matches Next.js app)
APP_DB_DSN=postgresql+asyncpg://user:password@localhost:5432/sat_app

# dbt
DBT_PROJECT_DIR=./dbt
DBT_PROFILES_DIR=./dbt
DBT_TARGET=dev
```

---

## Retry & Timeout Strategy

| Activity | Timeout | Max Attempts | Notes |
|----------|---------|--------------|-------|
| Scraper listing page | 5 min | 5 | Playwright, heartbeat per page |
| Scraper detail page | 3 min | 5 | Heartbeat per URL |
| ClickHouse sync | 10 min | 3 | Idempotent bulk insert |
| dbt run | 15 min | 3 | Subprocess, can be slow |
| dbt test | 10 min | 3 | Workflow fails if tests fail |
| App DB sync | 10 min | 3 | `ON CONFLICT DO UPDATE` |

---

## Local Dev Quick Start

```bash
# 1. Spin up all infrastructure
make up

# 2. Install Python deps + Playwright browsers
make install

# 3. Configure environment
cp .env.example .env
# fill in SATGPT_EMAIL, SATGPT_PASSWORD, and any other values

# 4. Start the Temporal worker   (terminal 1)
make worker

# 5. Trigger a pipeline run      (terminal 2)
make run

# View Temporal UI
open http://localhost:8080
```

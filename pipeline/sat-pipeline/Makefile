.PHONY: up down logs install lint test worker api run-ingest run-sync run-export schedule dbt-run dbt-test

## Infrastructure
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

## Python env
install:
	poetry install
	poetry run playwright install chromium

lint:
	poetry run ruff check .
	poetry run mypy .

test:
	poetry run pytest tests/

## Pipeline workers + API
worker:
	poetry run python workers/worker.py

api:
	poetry run python -m api.server

## Manual triggers (one-shot runs)
run-ingest:
	poetry run python scripts/trigger_pipeline.py ingest

run-sync:
	poetry run python scripts/trigger_pipeline.py sync

run-export:
	poetry run python scripts/trigger_pipeline.py export

## Scheduling
schedule:
	poetry run python schedules/register_schedule.py

## dbt (BigQuery by default; pass DBT_TARGET=clickhouse to override)
dbt-run:
	poetry run dbt run --select sat_clean --project-dir dbt --profiles-dir dbt

dbt-test:
	poetry run dbt test --select sat_clean --project-dir dbt --profiles-dir dbt

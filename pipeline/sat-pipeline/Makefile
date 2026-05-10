.PHONY: up down logs install lint test worker run schedule dbt-run dbt-test

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

## Pipeline
worker:
	poetry run python workers/worker.py

run:
	poetry run python scripts/trigger_pipeline.py

schedule:
	poetry run python schedules/register_schedule.py

## dbt
dbt-run:
	poetry run dbt run --select sat_clean --project-dir dbt --profiles-dir dbt

dbt-test:
	poetry run dbt test --select sat_clean --project-dir dbt --profiles-dir dbt

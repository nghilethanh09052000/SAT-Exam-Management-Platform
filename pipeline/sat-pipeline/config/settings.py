from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Temporal
    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "sat-pipeline"

    # Scraper — Bluebooky
    bluebooky_base_url: str = "https://bluebooky.com"

    # Scraper — SatGPT
    satgpt_base_url: str = "https://www.satgpt.xyz"
    satgpt_email: str = ""
    satgpt_password: str = ""

    # Shared scraper settings
    scraper_concurrency: int = 3
    scraper_delay_seconds: float = 1.5

    # ClickHouse (Flow 2 — sync)
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_db: str = "sat_raw"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    # App DB — PostgreSQL (Flow 2 — sync)
    app_db_dsn: str = "postgresql+asyncpg://user:password@localhost:5432/sat_app"

    # BigQuery (Flow 1 — ingest + transform)
    bq_project_id: str = ""
    bq_raw_dataset: str = "sat_raw"
    bq_clean_dataset: str = "sat_clean"
    bq_location: str = "US"

    # dbt
    dbt_project_dir: str = "./dbt"
    dbt_profiles_dir: str = "./dbt"
    dbt_target: str = "bigquery"      # bigquery (Flow 1) or clickhouse (Flow 2)

    # API server
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_secret_key: str = ""          # optional bearer token check


settings = Settings()

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

    # ClickHouse
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_db: str = "sat_raw"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    # App DB — PostgreSQL
    app_db_dsn: str = "postgresql+asyncpg://user:password@localhost:5432/sat_app"

    # dbt
    dbt_project_dir: str = "./dbt"
    dbt_profiles_dir: str = "./dbt"
    dbt_target: str = "dev"


settings = Settings()

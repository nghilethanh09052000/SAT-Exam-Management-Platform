from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RawQuestion(BaseModel):
    question_id: str
    source: Literal["bluebooky", "satgpt"]
    source_url: str
    section: str
    domain: str
    difficulty: str | None = None
    question_text: str
    choices: dict[str, str]
    correct_answer: str
    explanation: str | None = None
    scraped_at: datetime = Field(default_factory=datetime.utcnow)


class DbtRunResult(BaseModel):
    success: bool
    models_run: list[str]
    tests_passed: int
    tests_failed: int
    elapsed_seconds: float


class SyncResult(BaseModel):
    rows_inserted: int
    rows_updated: int
    rows_failed: int
    target: Literal["clickhouse", "app_db"]


class ExportResult(BaseModel):
    gcs_uri: str
    signed_url: str
    sections_exported: list[str]
    questions_exported: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)

import json

import clickhouse_connect
import structlog
from temporalio import activity

from config import settings
from models import RawQuestion, SyncResult

log = structlog.get_logger()

_CREATE_DB = "CREATE DATABASE IF NOT EXISTS sat_raw"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS sat_raw.sat_questions_raw (
    question_id     String,
    source          String,
    source_url      String,
    section         String,
    domain          String,
    difficulty      Nullable(String),
    question_text   String,
    choices         String,
    correct_answer  String,
    explanation     Nullable(String),
    scraped_at      DateTime
) ENGINE = MergeTree()
ORDER BY (source, question_id)
"""


def _client() -> clickhouse_connect.driver.Client:
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )


@activity.defn
async def create_clickhouse_tables() -> None:
    client = _client()
    client.command(_CREATE_DB)
    client.command(_CREATE_TABLE)
    log.info("clickhouse tables ensured")


@activity.defn
async def sync_questions_to_clickhouse(questions: list[RawQuestion]) -> SyncResult:
    if not questions:
        return SyncResult(rows_inserted=0, rows_updated=0, rows_failed=0, target="clickhouse")

    client = _client()
    rows = [
        [
            q.question_id,
            q.source,
            q.source_url,
            q.section,
            q.domain,
            q.difficulty,
            q.question_text,
            json.dumps(q.choices),
            q.correct_answer,
            q.explanation,
            q.scraped_at,
        ]
        for q in questions
    ]

    cols = [
        "question_id", "source", "source_url", "section", "domain",
        "difficulty", "question_text", "choices", "correct_answer",
        "explanation", "scraped_at",
    ]

    try:
        client.insert("sat_raw.sat_questions_raw", rows, column_names=cols)
        log.info("clickhouse insert done", rows=len(rows))
        return SyncResult(rows_inserted=len(rows), rows_updated=0, rows_failed=0, target="clickhouse")
    except Exception as exc:
        log.error("clickhouse insert failed", error=str(exc))
        return SyncResult(rows_inserted=0, rows_updated=0, rows_failed=len(rows), target="clickhouse")

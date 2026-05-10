import json

import asyncpg
import structlog
from temporalio import activity

from config import settings
from models import RawQuestion, SyncResult

log = structlog.get_logger()

_UPSERT_SQL = """
INSERT INTO sat_questions (
    question_id, source, source_url, section, domain, difficulty,
    question_text, choices, correct_answer, explanation, scraped_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (question_id) DO UPDATE SET
    source_url    = EXCLUDED.source_url,
    section       = EXCLUDED.section,
    domain        = EXCLUDED.domain,
    difficulty    = EXCLUDED.difficulty,
    question_text = EXCLUDED.question_text,
    choices       = EXCLUDED.choices,
    correct_answer= EXCLUDED.correct_answer,
    explanation   = EXCLUDED.explanation,
    scraped_at    = EXCLUDED.scraped_at
"""

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sat_questions (
    question_id    TEXT PRIMARY KEY,
    source         TEXT NOT NULL,
    source_url     TEXT NOT NULL,
    section        TEXT NOT NULL,
    domain         TEXT NOT NULL,
    difficulty     TEXT,
    question_text  TEXT NOT NULL,
    choices        JSONB NOT NULL DEFAULT '{}',
    correct_answer TEXT NOT NULL,
    explanation    TEXT,
    scraped_at     TIMESTAMPTZ NOT NULL
)
"""


async def _get_conn() -> asyncpg.Connection:
    dsn = settings.app_db_dsn.replace("postgresql+asyncpg://", "postgresql://")
    return await asyncpg.connect(dsn)


@activity.defn
async def ensure_app_db_schema() -> None:
    conn = await _get_conn()
    try:
        await conn.execute(_CREATE_TABLE_SQL)
        log.info("app_db schema ensured")
    finally:
        await conn.close()


@activity.defn
async def sync_questions_to_app_db(questions: list[RawQuestion]) -> SyncResult:
    if not questions:
        return SyncResult(rows_inserted=0, rows_updated=0, rows_failed=0, target="app_db")

    conn = await _get_conn()
    inserted = updated = failed = 0

    try:
        async with conn.transaction():
            for q in questions:
                try:
                    result = await conn.execute(
                        _UPSERT_SQL,
                        q.question_id, q.source, q.source_url, q.section, q.domain,
                        q.difficulty, q.question_text, json.dumps(q.choices),
                        q.correct_answer, q.explanation, q.scraped_at,
                    )
                    # "INSERT 0 1" → inserted, "UPDATE 1" → updated
                    if result.startswith("INSERT"):
                        inserted += 1
                    else:
                        updated += 1
                except Exception as exc:
                    log.warning("row upsert failed", question_id=q.question_id, error=str(exc))
                    failed += 1
    finally:
        await conn.close()

    log.info("app_db sync done", inserted=inserted, updated=updated, failed=failed)
    return SyncResult(rows_inserted=inserted, rows_updated=updated, rows_failed=failed, target="app_db")

import json
from datetime import datetime

import structlog
from google.cloud import bigquery
from temporalio import activity

from config import settings
from models import RawQuestion

log = structlog.get_logger()


def _client() -> bigquery.Client:
    return bigquery.Client(project=settings.bq_project_id)


@activity.defn
async def ensure_bigquery_datasets() -> None:
    """Create sat_raw and sat_clean datasets if they don't exist."""
    client = _client()
    for dataset_id in (settings.bq_raw_dataset, settings.bq_clean_dataset):
        ref = bigquery.DatasetReference(settings.bq_project_id, dataset_id)
        dataset = bigquery.Dataset(ref)
        dataset.location = settings.bq_location
        client.create_dataset(dataset, exists_ok=True)
    log.info("bigquery datasets ensured")


@activity.defn
async def insert_questions_to_bigquery(questions: list[RawQuestion]) -> int:
    """Stream-insert scraped questions directly into sat_raw.sat_questions_raw. Returns rows inserted."""
    activity.heartbeat("inserting questions → BigQuery")
    client = _client()

    table_id = f"{settings.bq_project_id}.{settings.bq_raw_dataset}.sat_questions_raw"
    rows = [
        {
            "question_id": q.question_id,
            "source": q.source,
            "source_url": q.source_url,
            "section": q.section,
            "domain": q.domain,
            "difficulty": q.difficulty,
            "question_text": q.question_text,
            "choices": json.dumps(q.choices),
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
            "scraped_at": q.scraped_at.isoformat(),
        }
        for q in questions
    ]

    errors = client.insert_rows_json(table_id, rows)
    if errors:
        raise RuntimeError(f"BigQuery streaming insert errors: {errors}")

    log.info("inserted to BigQuery", rows=len(rows))
    return len(rows)


@activity.defn
async def fetch_clean_questions_from_bigquery() -> list[RawQuestion]:
    """Query sat_clean.sat_questions and return as RawQuestion list."""
    activity.heartbeat("fetching clean questions from BigQuery")
    client = _client()

    query = f"""
        SELECT
            question_id, source, source_url, section, domain, difficulty,
            question_text, TO_JSON_STRING(choices) AS choices,
            correct_answer, explanation, scraped_at
        FROM `{settings.bq_project_id}.{settings.bq_clean_dataset}.sat_questions`
        ORDER BY section, domain, question_id
    """

    rows = list(client.query(query).result())
    questions = [
        RawQuestion(
            question_id=row.question_id,
            source=row.source,
            source_url=row.source_url,
            section=row.section,
            domain=row.domain,
            difficulty=row.difficulty,
            question_text=row.question_text,
            choices=json.loads(row.choices) if isinstance(row.choices, str) else dict(row.choices),
            correct_answer=row.correct_answer,
            explanation=row.explanation,
            scraped_at=row.scraped_at if isinstance(row.scraped_at, datetime) else datetime.utcnow(),
        )
        for row in rows
    ]
    log.info("fetched clean questions", count=len(questions))
    return questions

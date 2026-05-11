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
async def load_gcs_to_bigquery(gcs_uri: str) -> int:
    """Load NDJSON from GCS into sat_raw.sat_questions_raw. Returns rows loaded."""
    activity.heartbeat("loading GCS → BigQuery")
    client = _client()

    table_id = f"{settings.bq_project_id}.{settings.bq_raw_dataset}.sat_questions_raw"

    schema = [
        bigquery.SchemaField("question_id", "STRING"),
        bigquery.SchemaField("source", "STRING"),
        bigquery.SchemaField("source_url", "STRING"),
        bigquery.SchemaField("section", "STRING"),
        bigquery.SchemaField("domain", "STRING"),
        bigquery.SchemaField("difficulty", "STRING"),
        bigquery.SchemaField("question_text", "STRING"),
        bigquery.SchemaField("choices", "JSON"),
        bigquery.SchemaField("correct_answer", "STRING"),
        bigquery.SchemaField("explanation", "STRING"),
        bigquery.SchemaField("scraped_at", "TIMESTAMP"),
    ]

    job_config = bigquery.LoadJobConfig(
        schema=schema,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
    )

    job = client.load_table_from_uri(gcs_uri, table_id, job_config=job_config)
    job.result()  # wait for completion

    table = client.get_table(table_id)
    log.info("bigquery load done", rows=job.output_rows)
    return job.output_rows


@activity.defn
async def export_clean_to_gcs() -> str:
    """
    Export BigQuery sat_clean.sat_questions → GCS as NDJSON.
    Always writes to the same fixed prefix so Flow 3 always finds the latest snapshot.
    Returns the gs:// URI pattern.
    """
    activity.heartbeat("exporting sat_clean → GCS")
    client = _client()

    table_id = f"{settings.bq_project_id}.{settings.bq_clean_dataset}.sat_questions"
    # Use a fixed path so each run overwrites the previous snapshot
    gcs_uri = f"gs://{settings.gcs_bucket}/{settings.gcs_clean_prefix}/sat_questions_*.ndjson"

    job_config = bigquery.ExtractJobConfig(
        destination_format=bigquery.DestinationFormat.NEWLINE_DELIMITED_JSON,
        compression=bigquery.Compression.NONE,
    )
    job = client.extract_table(table_id, gcs_uri, job_config=job_config)
    job.result()

    log.info("sat_clean exported to GCS", uri=gcs_uri)
    return gcs_uri


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

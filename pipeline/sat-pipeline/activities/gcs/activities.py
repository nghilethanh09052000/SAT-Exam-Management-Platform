import json
from datetime import datetime, timedelta

import structlog
from google.cloud import storage
from temporalio import activity

from config import settings
from models import RawQuestion

log = structlog.get_logger()


def _client() -> storage.Client:
    return storage.Client(project=settings.bq_project_id)


@activity.defn
async def upload_questions_to_gcs(questions: list[RawQuestion], run_id: str) -> str:
    """Serialize questions as NDJSON and upload to GCS. Returns the gs:// URI."""
    activity.heartbeat("uploading to GCS")

    ndjson = "\n".join(q.model_dump_json() for q in questions)
    blob_name = f"{settings.gcs_raw_prefix}/{run_id}/sat_questions.ndjson"

    client = _client()
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(ndjson.encode(), content_type="application/x-ndjson")

    uri = f"gs://{settings.gcs_bucket}/{blob_name}"
    log.info("uploaded to GCS", uri=uri, rows=len(questions))
    return uri


@activity.defn
async def upload_file_to_gcs(local_path: str, blob_name: str) -> str:
    """Upload a local file to GCS. Returns the gs:// URI."""
    client = _client()
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    uri = f"gs://{settings.gcs_bucket}/{blob_name}"
    log.info("file uploaded to GCS", uri=uri)
    return uri


@activity.defn
async def fetch_questions_from_gcs(gcs_prefix: str) -> list[RawQuestion]:
    """
    Read all NDJSON files under a GCS prefix and return as RawQuestion list.
    Used by Flow 3 to read the clean snapshot exported by Flow 1.
    """
    activity.heartbeat("fetching questions from GCS")
    client = _client()
    bucket = client.bucket(settings.gcs_bucket)

    blobs = list(bucket.list_blobs(prefix=gcs_prefix))
    if not blobs:
        raise FileNotFoundError(f"No files found at gs://{settings.gcs_bucket}/{gcs_prefix}")

    questions: list[RawQuestion] = []
    for blob in blobs:
        if not blob.name.endswith(".ndjson"):
            continue
        content = blob.download_as_text()
        for line in content.splitlines():
            line = line.strip()
            if line:
                questions.append(RawQuestion.model_validate_json(line))

    log.info("fetched questions from GCS", prefix=gcs_prefix, count=len(questions))
    return questions


@activity.defn
async def generate_signed_url(blob_name: str) -> str:
    """Generate a signed URL for a GCS object."""
    client = _client()
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(blob_name)
    url = blob.generate_signed_url(
        expiration=timedelta(hours=settings.gcs_signed_url_expiry_hours),
        method="GET",
        version="v4",
    )
    return url

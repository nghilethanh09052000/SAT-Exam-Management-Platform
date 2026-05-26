"""
Temporal Demo — SAT Pipeline Simulator
=======================================
Run this in TWO terminals from the sat-pipeline/ directory:

  Terminal 1:  .venv/bin/python scripts/demo_temporal.py worker
  Terminal 2:  .venv/bin/python scripts/demo_temporal.py run

What this demonstrates:
  - Defining activities (@activity.defn) and workflows (@workflow.defn)
  - Executing activities from a workflow (workflow.execute_activity)
  - Running activities in parallel (asyncio.gather)
  - Activity heartbeating (activity.heartbeat) — required for long-running work
  - Automatic retries with a custom RetryPolicy
  - Structured workflow output you can see in the Temporal UI
  - How to connect a Worker and a Client

No external services needed — all work is simulated with sleep + fake data.
Open http://localhost:8080 to watch the workflow run step-by-step in real time.
"""
import asyncio
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import timedelta

import structlog
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

# ────────────────────────────────────────────────────────────────────────────
# Shared data types
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class FakeQuestion:
    question_id: str
    section: str
    domain: str
    text: str


@dataclass
class ExportSummary:
    total_questions: int
    sections: list[str]
    status: str


@dataclass
class DemoResult:
    questions_scraped: int
    questions_after_dedup: int
    rows_saved: int
    export_status: str
    export_sections: list[str]


TASK_QUEUE = "sat-demo"
log = structlog.get_logger()


# ────────────────────────────────────────────────────────────────────────────
# Activities  (the actual work units — each runs inside the worker process)
# ────────────────────────────────────────────────────────────────────────────

@activity.defn
async def scrape_questions(source: str) -> list[FakeQuestion]:
    """
    Simulates scraping questions from a source website.

    Key concepts shown here:
      - activity.heartbeat() tells Temporal "I'm still alive". If the worker
        crashes and restarts, Temporal will retry this activity from scratch.
        Without heartbeating a long-running activity looks dead to Temporal.
      - Activities can be retried automatically — see the RetryPolicy below.
    """
    log.info("scraping", source=source)
    sections = ["Math", "Reading & Writing"]
    domains = {
        "Math": ["Algebra", "Geometry", "Data Analysis"],
        "Reading & Writing": ["Grammar", "Vocabulary", "Comprehension"],
    }
    questions = []
    for i in range(3):
        await asyncio.sleep(0.3)          # simulate network I/O
        activity.heartbeat(f"scraped {i+1}/3 from {source}")   # heartbeat per item
        section = random.choice(sections)
        domain = random.choice(domains[section])
        questions.append(FakeQuestion(
            question_id=f"{source[:3]}-{uuid.uuid4().hex[:6]}",
            section=section,
            domain=domain,
            text=f"[{source}] Sample question #{i+1} on {domain}",
        ))

    log.info("scraping done", source=source, count=len(questions))
    return questions


@activity.defn
async def deduplicate_questions(questions: list[FakeQuestion]) -> list[FakeQuestion]:
    """
    Simulates deduplication (like dbt would do in the real pipeline).

    Key concept: activities are plain async functions — no special requirements
    beyond the @activity.defn decorator. Temporal handles serialisation of
    inputs and outputs automatically using JSON.
    """
    await asyncio.sleep(0.2)
    seen: set[str] = set()
    unique = []
    for q in questions:
        if q.question_id not in seen:
            seen.add(q.question_id)
            unique.append(q)
    log.info("dedup done", before=len(questions), after=len(unique))
    return unique


@activity.defn
async def save_to_database(questions: list[FakeQuestion]) -> int:
    """
    Simulates saving questions to the app database.

    Key concept: activities that fail raise exceptions — Temporal catches them
    and retries according to the RetryPolicy. If max_attempts is exceeded, the
    workflow receives a failure and can handle it (or fail itself).
    """
    activity.heartbeat("saving to DB")
    await asyncio.sleep(0.4)
    log.info("saved to database", rows=len(questions))
    return len(questions)


@activity.defn
async def generate_export_summary(total: int, sections: list[str]) -> ExportSummary:
    """
    Simulates building an export summary report.

    Key concept: use a @dataclass (not dict[str, object]) as the return type
    so Temporal knows exactly how to serialize and deserialize the value.
    """
    await asyncio.sleep(0.1)
    summary = ExportSummary(
        total_questions=total,
        sections=sections,
        status="ready for download",
    )
    log.info("export summary created", total=total, sections=sections)
    return summary


# ────────────────────────────────────────────────────────────────────────────
# Workflow  (the durable orchestrator — no I/O here, only activity calls)
# ────────────────────────────────────────────────────────────────────────────

@workflow.defn
class DemoPipelineWorkflow:
    """
    Simulates the SAT pipeline in three phases:
      1. Scrape questions from two sources IN PARALLEL
      2. Deduplicate the merged list
      3. Save to DB + generate export summary IN PARALLEL

    Key concepts:
      - Workflow code must be deterministic — no random(), no datetime.now(),
        no I/O. All non-deterministic work goes into activities.
      - workflow.execute_activity() schedules an activity and waits for it.
      - asyncio.gather() runs multiple activities concurrently (like asyncio.gather).
      - Every step is durably recorded in Temporal's event history. If the
        worker crashes mid-workflow, Temporal replays the history and resumes
        exactly where it left off — with zero data loss.
    """

    @workflow.run
    async def run(self) -> DemoResult:
        # Retry policy shared by all activities in this workflow.
        # Temporal will retry failed activities up to max_attempts times,
        # with exponential backoff between attempts.
        retry = RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=10),
        )

        # ── Phase 1: scrape two sources concurrently ──────────────────────
        # asyncio.gather() is the Temporal equivalent of asyncio.gather().
        # Both scrape_questions calls are dispatched to the worker at the
        # same time and run in parallel.
        bluebooky_qs, satgpt_qs = await asyncio.gather(
            workflow.execute_activity(
                scrape_questions,
                "bluebooky",
                start_to_close_timeout=timedelta(minutes=2),
                heartbeat_timeout=timedelta(seconds=10),
                retry_policy=retry,
            ),
            workflow.execute_activity(
                scrape_questions,
                "satgpt",
                start_to_close_timeout=timedelta(minutes=2),
                heartbeat_timeout=timedelta(seconds=10),
                retry_policy=retry,
            ),
        )
        all_questions = bluebooky_qs + satgpt_qs

        # ── Phase 2: dedup ────────────────────────────────────────────────
        clean_questions = await workflow.execute_activity(
            deduplicate_questions,
            all_questions,
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=retry,
        )

        # ── Phase 3: save + build summary concurrently ───────────────────
        sections = list({q.section for q in clean_questions})
        rows_saved, summary = await asyncio.gather(
            workflow.execute_activity(
                save_to_database,
                clean_questions,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=10),
                retry_policy=retry,
            ),
            workflow.execute_activity(
                generate_export_summary,
                args=[len(clean_questions), sections],
                start_to_close_timeout=timedelta(minutes=1),
                retry_policy=retry,
            ),
        )

        # This dataclass becomes the workflow result — visible in the Temporal UI
        # under the workflow's "Result" tab. Always use a @dataclass (not
        # dict[str, object]) so Temporal can serialize/deserialize cleanly.
        return DemoResult(
            questions_scraped=len(all_questions),
            questions_after_dedup=len(clean_questions),
            rows_saved=rows_saved,
            export_status=summary.status,
            export_sections=summary.sections,
        )


# ────────────────────────────────────────────────────────────────────────────
# Worker  (connects to Temporal server, polls for tasks)
# ────────────────────────────────────────────────────────────────────────────

async def run_worker() -> None:
    """
    A Worker:
      - Connects to the Temporal server
      - Registers which workflows and activities it can handle
      - Long-polls for tasks on a named task queue
      - Executes activity code when the server assigns a task
      - Reports results (or failures) back to the server

    The worker is where your actual Python code runs.
    The Temporal server is only an orchestrator — it stores workflow state
    and coordinates task dispatch, but never runs user code itself.
    """
    client = await Client.connect("localhost:7233")
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[DemoPipelineWorkflow],
        activities=[
            scrape_questions,
            deduplicate_questions,
            save_to_database,
            generate_export_summary,
        ],
    )
    log.info(
        "demo worker started",
        task_queue=TASK_QUEUE,
        ui="http://localhost:8080",
    )
    await worker.run()


# ────────────────────────────────────────────────────────────────────────────
# Client  (triggers a workflow and waits for the result)
# ────────────────────────────────────────────────────────────────────────────

async def run_once() -> None:
    """
    A Client:
      - Connects to the Temporal server
      - Starts a new workflow execution (non-blocking — returns immediately)
      - Optionally waits for the result with handle.result()

    The workflow ID must be unique per logical run. Reusing the same ID
    will return the already-running workflow handle (idempotent starts).
    """
    client = await Client.connect("localhost:7233")
    run_uid = uuid.uuid4().hex[:6]
    workflow_id = f"demo-pipeline-{run_uid}"

    log.info("starting workflow", workflow_id=workflow_id, ui=f"http://localhost:8080/namespaces/default/workflows/{workflow_id}")

    # start_workflow is fire-and-forget. execute_workflow would also wait.
    handle = await client.start_workflow(
        DemoPipelineWorkflow.run,
        id=workflow_id,
        task_queue=TASK_QUEUE,
    )

    print(f"\n  Workflow started → {workflow_id}")
    print(f"  Watch it live at  http://localhost:8080/namespaces/default/workflows/{workflow_id}\n")

    result: DemoResult = await handle.result()

    print("\n  Workflow completed!")
    print(f"  Questions scraped:      {result.questions_scraped}")
    print(f"  After dedup:            {result.questions_after_dedup}")
    print(f"  Rows saved to DB:       {result.rows_saved}")
    print(f"  Sections exported:      {result.export_sections}")
    print(f"  Export status:          {result.export_status}\n")


# ────────────────────────────────────────────────────────────────────────────
# Entry point
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "help"

    if mode == "worker":
        asyncio.run(run_worker())
    elif mode == "run":
        asyncio.run(run_once())
    else:
        print(__doc__)

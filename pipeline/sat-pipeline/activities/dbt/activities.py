import subprocess
import time

import structlog
from temporalio import activity

from config import settings
from models import DbtRunResult

log = structlog.get_logger()


def _run_dbt(command: str, select: str = "sat_clean") -> tuple[bool, list[str], float]:
    start = time.monotonic()
    result = subprocess.run(
        [
            "dbt", command,
            "--select", select,
            "--project-dir", settings.dbt_project_dir,
            "--profiles-dir", settings.dbt_profiles_dir,
            "--target", settings.dbt_target,
        ],
        capture_output=True,
        text=True,
    )
    elapsed = time.monotonic() - start
    success = result.returncode == 0
    if not success:
        log.error("dbt command failed", command=command, stderr=result.stderr)
    models = [
        line.split()[-1]
        for line in result.stdout.splitlines()
        if "OK" in line or "PASS" in line
    ]
    return success, models, elapsed


@activity.defn
async def dbt_run_models() -> DbtRunResult:
    activity.heartbeat("dbt run started")
    success, models_run, elapsed = _run_dbt("run")
    return DbtRunResult(
        success=success,
        models_run=models_run,
        tests_passed=0,
        tests_failed=0,
        elapsed_seconds=elapsed,
    )


@activity.defn
async def dbt_test_models() -> DbtRunResult:
    activity.heartbeat("dbt test started")
    success, models_run, elapsed = _run_dbt("test")

    stdout_lines = []
    result = subprocess.run(
        [
            "dbt", "test",
            "--select", "sat_clean",
            "--project-dir", settings.dbt_project_dir,
            "--profiles-dir", settings.dbt_profiles_dir,
            "--target", settings.dbt_target,
        ],
        capture_output=True,
        text=True,
    )
    for line in result.stdout.splitlines():
        stdout_lines.append(line)

    tests_passed = sum(1 for l in stdout_lines if "PASS" in l)
    tests_failed = sum(1 for l in stdout_lines if "FAIL" in l)

    return DbtRunResult(
        success=success,
        models_run=models_run,
        tests_passed=tests_passed,
        tests_failed=tests_failed,
        elapsed_seconds=elapsed,
    )

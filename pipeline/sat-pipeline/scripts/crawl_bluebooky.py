#!/usr/bin/env python3
"""
crawl_bluebooky.py — Fetch all SAT questions from bluebooky.com's Supabase API.

Flow
----
  1. GET /available_tests          → list of {test_date, section, question_count}
  2. GET /questions?select=id&...  → all question IDs for each test
  3. GET /questions?id=in.(...)    → full question detail (batched, 50/request)
  4. Save one JSON file per test   → output/bluebooky/raw/<test_date>_<section>.json
  5. Write a summary               → output/bluebooky/index.json

Usage
-----
    cd pipeline/sat-pipeline

    # No setup needed — anon key is hardcoded (public, expires 2036)
    python3 scripts/crawl_bluebooky.py

    # If you get 401 on some endpoints, grab your session token from DevTools and pass it:
    BLUEBOOKY_AUTH_TOKEN="eyJ..." python3 scripts/crawl_bluebooky.py

Re-run behaviour
----------------
  - Each test file is cached → already-saved files are skipped on re-run
  - To re-fetch everything:  rm -rf output/bluebooky/raw/
  - To fetch only new tests: just re-run (skips cached, fetches new)

Output
------
  output/bluebooky/raw/<test_date>_<section>.json   one file per test
  output/bluebooky/index.json                       summary of all tests

Question JSON format (per test file)
-------------------------------------
{
  "test_date": "2026-05-02",
  "section": "rw",                     // "rw" | "math"
  "question_count": 283,
  "questions": [
    {
      "id": 11426,
      "q_type": "mcq",                 // "mcq" | "spr" | ...
      "section": "rw",
      "prompt": "Which choice completes...",
      "passage": "Research has shown...",
      "image_url": null,               // URL string or null
      "image_dimensions": {...},
      "viz_data": null,                // JSONB — chart/table data (see notes below)
      "options": [                     // MCQ: list of {text}; SPR: empty []
        {"text": "unique to"},
        ...
      ],
      "correct_answer": null           // populated if available in API response
    },
    ...
  ],
  "fetched_at": "2026-05-14T..."
}

viz_data notes (for future PDF rendering)
------------------------------------------
  viz_data is null for most questions. When present it may contain:
    - Table data:   {"type": "table", "headers": [...], "rows": [[...]]}
    - Chart data:   {"type": "bar"|"line"|"scatter", "data": {...}}
    - XY graph:     {"type": "xy", ...}
  The script saves viz_data raw. A separate pdf converter will handle rendering.
  Run:  python3 scripts/analyze_bluebooky_viztypes.py
  to see a summary of all viz_data types found in the downloaded data.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = "https://ststltkgcljznxibljyv.supabase.co/rest/v1"
BATCH_SIZE   = 50    # question IDs per batch request (stay under URL length limits)
DELAY        = 0.15  # seconds between requests

OUTPUT_DIR = Path(__file__).parent.parent / "output" / "bluebooky"
RAW_DIR    = OUTPUT_DIR / "raw"

# Full question fields to fetch in detail requests
QUESTION_FIELDS = "id,q_type,section,prompt,passage,image_url,image_dimensions,viz_data,options"

# Long-lived anon key (public, expires 2036) — safe to hardcode
_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0c3RsdGtnY2xqem54aWJsanl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODAwNDQsImV4cCI6MjA4OTI1NjA0NH0"
    ".fXaETfZVMTiyQjIQQhrLhlrHKvpVFDp3l6pk2HAZsUI"
)

# Optional: override with a short-lived session token if some endpoints need auth
# Get it from Chrome DevTools → Network → Authorization header (starts with Bearer ey...)
# It expires every hour; re-grab when you see 401 errors on auth-gated endpoints
_AUTH_TOKEN = os.environ.get("BLUEBOOKY_AUTH_TOKEN", _ANON_KEY)


def _headers() -> dict[str, str]:
    return {
        "apikey": _ANON_KEY,
        "Authorization": f"Bearer {_AUTH_TOKEN}",
        "Accept": "application/json",
        "Accept-Profile": "public",
        "Content-Type": "application/json",
        "Origin": "https://bluebooky.com",
        "Referer": "https://bluebooky.com/",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
        ),
        "x-client-info": "supabase-js-web/2.100.1",
    }


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _get(client: httpx.Client, url: str, params: dict | None = None) -> list | dict:
    """GET with retry on transient errors."""
    for attempt in range(3):
        try:
            r = client.get(url, params=params, timeout=20)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                print(
                    "\nERROR 401 Unauthorized.\n"
                    "  Some endpoints need your session token (expires hourly).\n"
                    "  Grab it from Chrome DevTools → Network → Authorization header, then:\n"
                    "  BLUEBOOKY_AUTH_TOKEN='Bearer ey...' python3 scripts/crawl_bluebooky.py\n",
                    file=sys.stderr,
                )
                sys.exit(1)
            print(f"  HTTP {e.response.status_code} on attempt {attempt+1}: {url}", file=sys.stderr)
        except Exception as e:
            print(f"  Error attempt {attempt+1}: {e}", file=sys.stderr)
        time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed after 3 attempts: {url}")


def fetch_available_tests(client: httpx.Client) -> list[dict]:
    return _get(client, f"{SUPABASE_URL}/available_tests", {
        "select": "test_date,section,question_count,title",
        "order": "test_date.desc,section.asc",
    })  # type: ignore[return-value]


def fetch_question_ids(client: httpx.Client, test_date: str, section: str) -> list[int]:
    rows = _get(client, f"{SUPABASE_URL}/questions", {
        "select": "id",
        "test_date": f"eq.{test_date}",
        "section": f"eq.{section}",
        "is_published": "eq.true",
        "order": "id.asc",
    })
    return [r["id"] for r in rows]  # type: ignore[union-attr]


def fetch_question_batch(client: httpx.Client, ids: list[int]) -> list[dict]:
    """Fetch full question detail for up to BATCH_SIZE IDs in one request."""
    id_list = ",".join(str(i) for i in ids)
    rows = _get(client, f"{SUPABASE_URL}/questions", {
        "select": QUESTION_FIELDS,
        "id": f"in.({id_list})",
        "is_published": "eq.true",
        "order": "id.asc",
    })
    return rows  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_filename(test_date: str, section: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", f"{test_date}_{section}")


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    headers = _headers()

    with httpx.Client(headers=headers, follow_redirects=True) as client:

        # ── 1. Fetch test catalogue ────────────────────────────────────────
        print("Fetching test catalogue…")
        tests = fetch_available_tests(client)
        print(f"Found {len(tests)} test × section combinations\n")

        index: list[dict] = []
        total_questions = 0

        for i, test in enumerate(tests, 1):
            test_date  = test["test_date"]
            section    = test["section"]
            q_count    = test.get("question_count", "?")
            label      = f"[{i:2}/{len(tests)}] {test_date} / {section:<4}  ({q_count} q)"

            raw_path = RAW_DIR / f"{safe_filename(test_date, section)}.json"

            if raw_path.exists():
                cached = json.loads(raw_path.read_text(encoding="utf-8"))
                n = len(cached.get("questions", []))
                print(f"{label}  cached ({n} questions)")
                index.append({
                    "test_date": test_date,
                    "section": section,
                    "question_count": n,
                    "file": raw_path.name,
                })
                total_questions += n
                continue

            # ── 2. Fetch question IDs ──────────────────────────────────────
            print(f"{label}  fetching IDs…", end="", flush=True)
            ids = fetch_question_ids(client, test_date, section)
            print(f" {len(ids)} IDs", end="", flush=True)
            time.sleep(DELAY)

            # ── 3. Fetch question details in batches ──────────────────────
            questions: list[dict] = []
            batches = list(_chunks(ids, BATCH_SIZE))
            for b_idx, batch in enumerate(batches):
                batch_qs = fetch_question_batch(client, batch)
                questions.extend(batch_qs)
                print(f" [{b_idx+1}/{len(batches)}]", end="", flush=True)
                time.sleep(DELAY)

            # ── 4. Save ────────────────────────────────────────────────────
            payload = {
                "test_date": test_date,
                "section": section,
                "question_count": len(questions),
                "questions": questions,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            raw_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  → saved {raw_path.name}  ({len(questions)} questions)")

            index.append({
                "test_date": test_date,
                "section": section,
                "question_count": len(questions),
                "file": raw_path.name,
            })
            total_questions += len(questions)

    # ── 5. Write index ─────────────────────────────────────────────────────
    index_path = OUTPUT_DIR / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "total_tests": len(index),
                "total_questions": total_questions,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "tests": index,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    # ── 6. Analyze viz_data types across all files ─────────────────────────
    viz_types: dict[str, int] = {}
    q_types:   dict[str, int] = {}
    for raw_path in RAW_DIR.glob("*.json"):
        data = json.loads(raw_path.read_text(encoding="utf-8"))
        for q in data.get("questions", []):
            qt = q.get("q_type") or "unknown"
            q_types[qt] = q_types.get(qt, 0) + 1
            vd = q.get("viz_data")
            if vd:
                vtype = (vd.get("type") or "no_type") if isinstance(vd, dict) else type(vd).__name__
                viz_types[vtype] = viz_types.get(vtype, 0) + 1

    print(f"\n{'─'*60}")
    print(f"✓  {len(index)} tests  |  {total_questions} total questions")
    print(f"   Raw JSON : {RAW_DIR}")
    print(f"   Index    : {index_path}")

    print(f"\nQuestion types:")
    for qt, count in sorted(q_types.items(), key=lambda x: -x[1]):
        print(f"   {qt:<25}  {count:>6}")

    if viz_types:
        print(f"\nviz_data types found (need special PDF handling):")
        for vt, count in sorted(viz_types.items(), key=lambda x: -x[1]):
            print(f"   {vt:<25}  {count:>6}")
    else:
        print("\nviz_data: none found in downloaded data (all null)")


if __name__ == "__main__":
    main()

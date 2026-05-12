#!/usr/bin/env python3
"""
crawl_satpro.py — Fetch all SAT exams from the API, save JSON, and render PDFs.

Behaviour
---------
- Fetches the full exam list from the API.
- For each exam, downloads the detail JSON (or reuses a cached copy).
- Renders a PDF with KaTeX-quality math via Playwright (one shared browser for speed).
- Zips all PDFs into output/sat_exams.zip.

Usage
-----
    cd pipeline/sat-pipeline
    python3 scripts/crawl_satpro.py

Re-run behaviour
- Raw JSON is cached in output/raw/ — already-fetched exams are never re-requested.
- PDFs are always regenerated from the cached JSON (fast, no network).
- To force a full re-fetch:  rm -rf output/raw/
- To regenerate PDFs only:   python3 scripts/crawl_satpro.py   (reads cache)
- To start completely fresh: rm -rf output/ && python3 scripts/crawl_satpro.py

Output
------
  output/raw/<id>.json           raw exam JSON
  output/pdf/<id>_<title>.pdf    rendered PDF per exam
  output/sat_exams.zip           zip of all PDFs
"""

from __future__ import annotations

import json
import re
import sys
import time
import zipfile
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

# Import HTML builder + low-level renderer from the sibling script
sys.path.insert(0, str(Path(__file__).parent))
from json_to_pdf import _build_html, _render_to_bytes  # noqa: E402

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "https://satpromaxvip-production.up.railway.app/api/sat"
DELAY    = 0.3   # seconds between API requests (be polite)

OUTPUT  = Path(__file__).parent.parent / "output"
RAW_DIR = OUTPUT / "raw"
PDF_DIR = OUTPUT / "pdf"

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "authorization": (
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
        ".eyJ1c2VyX2lkIjoxNTgzLCJlbWFpbCI6Im5naGlsdDE5NDExdXB3b3JrQGdtYWlsLmNvbSIsImlzX2FkbWluIjow"
        "LCJyb2xlIjoic3R1ZGVudCIsImV4cCI6MTgwOTk0MTU0MCwiaWF0IjoxNzc4NDA1NTQwLCJ0eXBlIjoiYWNjZXNzIi"
        "wianRpIjoiOWZkY2ZlYWUwNTEzNDJiMGFkNDkwNjNhNjhmOTRmY2EifQ"
        ".xim7yfq0j7fLoP5A0zoZ33iNqObWBpKecJlV2VDwnt0"
    ),
    "origin": "https://www.satgpt.xyz",
    "referer": "https://www.satgpt.xyz/",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
    ),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def fetch_exam_list(client: httpx.Client) -> list[dict]:
    for attempt in range(3):
        try:
            r = client.get(f"{BASE_URL}/exams", timeout=30)
            r.raise_for_status()
            return r.json().get("exams", [])
        except Exception as e:
            print(f"  List fetch attempt {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(3)
    raise RuntimeError("Could not fetch exam list after 3 attempts")


def fetch_exam_detail(client: httpx.Client, exam_id: int | str) -> dict | None:
    try:
        r = client.get(f"{BASE_URL}/exams/{exam_id}", timeout=15)
        if r.status_code in (403, 404):
            return None
        r.raise_for_status()
        data = r.json()
        return None if "detail" in data else data
    except Exception as e:
        print(f"  ERROR fetching {exam_id}: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)

    # ── 1. Fetch / cache JSON ──────────────────────────────────────────────
    with httpx.Client(follow_redirects=True, headers=HEADERS) as client:
        print("Fetching exam list…")
        exams_meta = fetch_exam_list(client)
        total = len(exams_meta)
        print(f"Found {total} accessible exams\n")

        fetched_json = skipped = 0
        exams_to_render: list[tuple[Path, dict]] = []

        for i, meta in enumerate(exams_meta, 1):
            exam_id = meta["id"]
            title   = meta.get("title", str(exam_id))
            label   = f"[{i:3}/{total}] ID {exam_id:6}  {title[:50]:<50}"

            raw_path = RAW_DIR / f"{exam_id}.json"

            if raw_path.exists():
                exam = json.loads(raw_path.read_text(encoding="utf-8"))
                print(f"{label} cached")
            else:
                print(f"{label} fetching…", end="", flush=True)
                exam = fetch_exam_detail(client, exam_id)
                if exam is None:
                    print("  skipped (403/404 or error)")
                    skipped += 1
                    time.sleep(DELAY)
                    continue
                raw_path.write_text(
                    json.dumps(exam, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(f"  saved → {raw_path.name}")
                fetched_json += 1
                time.sleep(DELAY)

            fname    = safe_filename(f"{exam_id}_{exam.get('title', exam_id)}") + ".pdf"
            pdf_path = PDF_DIR / fname
            exams_to_render.append((pdf_path, exam))

    print(
        f"\nJSON phase done — {fetched_json} fetched, {skipped} skipped, "
        f"{len(exams_to_render)} queued for PDF\n"
    )

    # ── 2. Render PDFs (one shared Playwright browser) ─────────────────────
    rendered = failed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page    = browser.new_page()

        for idx, (pdf_path, exam) in enumerate(exams_to_render, 1):
            title = exam.get("title", pdf_path.stem)
            print(
                f"[{idx:3}/{len(exams_to_render)}] Rendering  {title[:55]:<55} … ",
                end="",
                flush=True,
            )
            try:
                html_content = _build_html(
                    exam, include_answer_key=True, section_filter=None
                )
                pdf_bytes = _render_to_bytes(page, html_content)
                pdf_path.write_bytes(pdf_bytes)
                print(f"OK  ({len(pdf_bytes) // 1024} KB)")
                rendered += 1
            except Exception as e:
                print(f"FAILED: {e}", file=sys.stderr)
                failed += 1

        browser.close()

    # ── 3. Zip all PDFs ────────────────────────────────────────────────────
    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    zip_path  = OUTPUT / "sat_exams.zip"
    print(f"\nZipping {len(pdf_files)} PDFs → {zip_path.name} …")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in pdf_files:
            zf.write(f, f.name)

    print(
        f"\n✓  {rendered} rendered  |  {failed} failed  |  {skipped} API-skipped\n"
        f"   PDFs : {PDF_DIR}  ({len(pdf_files)} files)\n"
        f"   ZIP  : {zip_path}  ({zip_path.stat().st_size / 1024:.0f} KB)"
    )


if __name__ == "__main__":
    main()

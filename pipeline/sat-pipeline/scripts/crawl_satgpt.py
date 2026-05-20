#!/usr/bin/env python3
"""
crawl_satgpt.py — Fetch all SAT exams from satgpt.xyz and save locally.

Pure httpx — no browser / Playwright required.

Flow
----
  1. POST login credentials → receive auth token (Bearer) or session cookie
  2. GET /api/exams         → list of all exam stubs
  3. GET /api/exams/{id}    → full exam with sections + questions  (one per ID)
  4. Save one JSON file per exam  → output/satgpt/raw/<id>_<slug>.json
  5. Write a summary index        → output/satgpt/index.json
  6. (optional) Convert all saved JSON files to PDF → output/satgpt/pdf/

Usage
-----
    cd pipeline/sat-pipeline

    # Set credentials (once):
    cp .env.example .env          # fill SATGPT_EMAIL + SATGPT_PASSWORD

    python3 scripts/crawl_satgpt.py              # fetch everything
    python3 scripts/crawl_satgpt.py --pdf        # fetch + convert to PDF
    python3 scripts/crawl_satgpt.py --ids 2 3 30116          # specific exams only
    python3 scripts/crawl_satgpt.py --ids 2 3 30116 --pdf    # specific + convert to PDF
    python3 scripts/crawl_satgpt.py --dry-run                # print exam list, don't save

Re-run behaviour
----------------
  Each exam file is cached → already-saved files are skipped on re-run.
  PDF conversion also skips files that already have a PDF (use --force-pdf to override).
  To re-fetch everything:      rm -rf output/satgpt/raw/
  To re-fetch specific exams:  rm output/satgpt/raw/<id>_*.json

Output
------
  output/satgpt/raw/<id>_<slug>.json    one file per exam
  output/satgpt/index.json              summary of all exams
  output/satgpt/pdf/<id>_<slug>.pdf     (only when --pdf is passed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO FIND THE API ENDPOINTS (if the defaults don't work)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open Chrome → satgpt.xyz → F12 (DevTools) → Network tab
2. Filter by "Fetch/XHR"
3. Log in — look for a POST request with your credentials.
   Copy that URL → update API_LOGIN below.
4. Navigate to the exam list page.
   Look for a GET request returning a JSON array of exams.
   Copy that URL → update API_EXAMS below.
5. Click on one exam.
   Look for a GET request returning sections + questions.
   Copy the URL pattern → update API_EXAM_DETAIL below.
6. Check the response headers of any authenticated request:
   - If it has "Authorization: Bearer ..." → token auth (update _auth_header)
   - If it uses cookies → httpx handles them automatically via cookie_jar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Allow `from scripts.json_to_pdf import ...` when running as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

# ---------------------------------------------------------------------------
# Load .env (no python-dotenv required)
# ---------------------------------------------------------------------------

_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip("\"' "))

# ---------------------------------------------------------------------------
# ★ API CONFIG — update these if the endpoints or auth method change ★
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("SATGPT_BASE_URL", "https://www.satgpt.xyz").rstrip("/")
EMAIL    = os.environ.get("SATGPT_EMAIL", "")
PASSWORD = os.environ.get("SATGPT_PASSWORD", "")
DELAY    = float(os.environ.get("SCRAPER_DELAY_SECONDS", "1.0"))

# Auth endpoint — POST with {email, password}
API_LOGIN = f"{BASE_URL}/api/auth/login"

# Exam list — GET → list[{id, title, ...}]
API_EXAMS = f"{BASE_URL}/api/exams"

# Exam detail — GET → {id, title, sections: [{name, questions: [...]}]}
# Use {id} as a placeholder for the exam ID
API_EXAM_DETAIL = f"{BASE_URL}/api/exams/{{id}}"

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------

OUTPUT_DIR = Path(__file__).parent.parent / "output" / "satgpt"
RAW_DIR    = OUTPUT_DIR / "raw"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()[:60]


def _get(client: httpx.Client, url: str, params: dict | None = None) -> dict | list:
    """GET with simple retry on transient errors."""
    for attempt in range(3):
        try:
            r = client.get(url, params=params, timeout=30)
            if r.status_code == 401:
                print(
                    "\nERROR 401 — auth token expired or login failed.\n"
                    "  Check SATGPT_EMAIL / SATGPT_PASSWORD in .env\n"
                    "  or inspect the login response and update API_LOGIN.\n",
                    file=sys.stderr,
                )
                sys.exit(1)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            print(f"  HTTP {e.response.status_code} attempt {attempt + 1}: {url}", file=sys.stderr)
        except Exception as e:
            print(f"  Error attempt {attempt + 1}: {e}", file=sys.stderr)
        time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed after 3 attempts: {url}")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def login() -> httpx.Client:
    """
    POST credentials to API_LOGIN.
    Returns an httpx.Client that is pre-configured with either:
      - Bearer token in the Authorization header, OR
      - Session cookies (httpx persists cookies automatically)
    """
    if not EMAIL or not PASSWORD:
        print(
            "ERROR: SATGPT_EMAIL and SATGPT_PASSWORD must be set in .env",
            file=sys.stderr,
        )
        sys.exit(1)

    client = httpx.Client(
        follow_redirects=True,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": BASE_URL,
            "Referer": BASE_URL + "/",
        },
        timeout=30,
    )

    print(f"Logging in as {EMAIL}…")
    try:
        r = client.post(
            API_LOGIN,
            json={"email": EMAIL, "password": PASSWORD},
        )
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(
            f"Login failed (HTTP {e.response.status_code}).\n"
            f"  URL tried: {API_LOGIN}\n"
            f"  Response:  {e.response.text[:300]}\n"
            "  → Update API_LOGIN in crawl_satgpt.py to the correct endpoint.",
            file=sys.stderr,
        )
        sys.exit(1)

    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    # ── Try to extract a Bearer token from the response body ──────────────
    token: str = ""
    for key in ("token", "access_token", "accessToken", "jwt", "id_token"):
        if isinstance(body.get(key), str):
            token = body[key]
            break
    # Nested under "data" or "user"
    if not token:
        for wrapper in ("data", "user", "auth"):
            sub = body.get(wrapper, {})
            for key in ("token", "access_token", "accessToken", "jwt"):
                if isinstance(sub, dict) and isinstance(sub.get(key), str):
                    token = sub[key]
                    break
            if token:
                break

    if token:
        client.headers["Authorization"] = f"Bearer {token}"
        print("  ✓ Bearer token obtained.")
    else:
        # No token in body — assume cookie-based auth (httpx cookie_jar handles it)
        cookies = dict(r.cookies)
        if cookies:
            print(f"  ✓ Session cookie set: {list(cookies.keys())}")
        else:
            print(
                "  WARNING: No token or cookie found in login response.\n"
                f"  Response body: {json.dumps(body)[:300]}\n"
                "  If the site uses a different auth flow, inspect DevTools and update login().",
                file=sys.stderr,
            )

    return client


# ---------------------------------------------------------------------------
# Fetch exam list
# ---------------------------------------------------------------------------

def fetch_exam_list(client: httpx.Client) -> list[dict]:
    print(f"Fetching exam list from {API_EXAMS}…")
    data = _get(client, API_EXAMS)

    # Unwrap common response envelopes
    if isinstance(data, list):
        exams = data
    elif isinstance(data, dict):
        exams = []
        for key in ("exams", "tests", "data", "results", "items"):
            if isinstance(data.get(key), list):
                exams = data[key]
                break
    else:
        exams = []

    if not exams:
        print(
            f"ERROR: exam list endpoint returned no exams.\n"
            f"  URL: {API_EXAMS}\n"
            f"  Response: {json.dumps(data)[:300]}\n"
            "  → Update API_EXAMS in crawl_satgpt.py to the correct endpoint.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"  Found {len(exams)} exams.")
    return exams


# ---------------------------------------------------------------------------
# Fetch exam detail
# ---------------------------------------------------------------------------

def fetch_exam_detail(client: httpx.Client, exam_id: int) -> dict | None:
    url = API_EXAM_DETAIL.format(id=exam_id)
    try:
        data = _get(client, url)
    except RuntimeError:
        return None

    # Unwrap if nested
    if isinstance(data, dict):
        if "sections" in data:
            return data
        for key in ("exam", "test", "data"):
            if isinstance(data.get(key), dict) and "sections" in data[key]:
                return data[key]

    print(f"  WARNING: detail response for {exam_id} has no 'sections' key.", file=sys.stderr)
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _convert_to_pdf(raw_paths: list[Path], pdf_dir: Path, force: bool) -> None:
    """Convert a list of raw JSON files to PDF using Playwright + KaTeX."""
    from playwright.sync_api import sync_playwright
    from scripts.json_to_pdf import _build_html, _render_to_bytes

    pdf_dir.mkdir(parents=True, exist_ok=True)

    to_convert = []
    for rp in raw_paths:
        out = pdf_dir / f"{rp.stem}.pdf"
        if out.exists() and not force:
            print(f"  PDF exists, skipping: {rp.name}  (use --force-pdf to overwrite)")
        else:
            to_convert.append(rp)

    if not to_convert:
        print("  All PDFs already up to date.")
        return

    print(f"\nConverting {len(to_convert)} file(s) to PDF…")
    pdf_errors: list[tuple[str, str]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page    = browser.new_page()

        for i, rp in enumerate(to_convert, 1):
            out   = pdf_dir / f"{rp.stem}.pdf"
            label = f"  [{i:3}/{len(to_convert)}] {rp.name}"
            try:
                data         = json.loads(rp.read_text(encoding="utf-8"))
                html_content = _build_html(data, include_answer_key=True, section_filter=None)
                pdf_bytes    = _render_to_bytes(page, html_content)
                out.write_bytes(pdf_bytes)
                print(f"{label}  → {out.name}")
            except Exception as exc:
                print(f"{label}  ERROR: {exc}", file=sys.stderr)
                pdf_errors.append((rp.name, str(exc)))

        browser.close()

    if pdf_errors:
        print("\nPDF conversion errors:")
        for name, err in pdf_errors:
            print(f"  {name}: {err}")
    else:
        print(f"  ✓ {len(to_convert)} PDFs saved → {pdf_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape satgpt.xyz exams to local JSON files.")
    parser.add_argument("--ids", nargs="+", type=int, help="Only fetch these exam IDs")
    parser.add_argument("--dry-run", action="store_true", help="List exams without saving")
    parser.add_argument(
        "--pdf",
        action="store_true",
        help="Convert all saved JSON files to PDF after scraping",
    )
    parser.add_argument(
        "--force-pdf",
        action="store_true",
        help="Re-convert PDFs even if they already exist (implies --pdf)",
    )
    args = parser.parse_args()

    # --force-pdf implies --pdf
    if args.force_pdf:
        args.pdf = True

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    client = login()

    exams = fetch_exam_list(client)

    # Filter to requested IDs if provided
    if args.ids:
        exams = [e for e in exams if e.get("id") in args.ids]
        print(f"  Filtered to {len(exams)} exam(s): {args.ids}")

    if args.dry_run:
        print("\nDry run — exams found:")
        for e in exams:
            print(f"  #{e.get('id'):6}  {e.get('title', '')}")
        return

    index: list[dict] = []
    total_questions   = 0
    saved_paths: list[Path] = []   # tracks all raw JSON paths (new + cached)

    for i, stub in enumerate(exams, 1):
        exam_id = stub.get("id")
        if not exam_id:
            continue

        title    = stub.get("title", str(exam_id))
        filename = f"{exam_id}_{_slug(title)}.json"
        raw_path = RAW_DIR / filename
        label    = f"[{i:3}/{len(exams)}] #{exam_id:<6} {title}"

        # Skip cached
        if raw_path.exists():
            cached = json.loads(raw_path.read_text(encoding="utf-8"))
            n = sum(len(s.get("questions", [])) for s in cached.get("sections", []))
            print(f"{label}  cached ({n} q)")
            index.append(_index_entry(cached, filename, n))
            total_questions += n
            saved_paths.append(raw_path)
            continue

        print(f"{label}  fetching…", end="", flush=True)
        detail = fetch_exam_detail(client, exam_id)

        if detail is None:
            print("  SKIP (fetch failed)")
            continue

        # Merge stub fields not present in detail
        for k, v in stub.items():
            if k not in detail:
                detail[k] = v

        detail["fetched_at"] = datetime.now(timezone.utc).isoformat()

        n = sum(len(s.get("questions", [])) for s in detail.get("sections", []))
        raw_path.write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  saved ({n} q)")

        index.append(_index_entry(detail, filename, n))
        total_questions += n
        saved_paths.append(raw_path)
        time.sleep(DELAY)

    # Write index
    index_path = OUTPUT_DIR / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "total_exams": len(index),
                "total_questions": total_questions,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "exams": index,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"\n{'─'*60}")
    print(f"✓  {len(index)} exams  |  {total_questions} total questions")
    print(f"   Raw JSON : {RAW_DIR}")
    print(f"   Index    : {index_path}")

    # ── Optional PDF conversion ────────────────────────────────────────────
    if args.pdf and saved_paths:
        pdf_dir = OUTPUT_DIR / "pdf"
        print(f"\n{'─'*60}")
        print(f"PDF conversion → {pdf_dir}")
        _convert_to_pdf(saved_paths, pdf_dir, force=args.force_pdf)
        print(f"   PDFs     : {pdf_dir}")
    else:
        print()
        print("Tip: add --pdf to also convert everything to PDF in one go.")


def _index_entry(detail: dict, filename: str, n_questions: int) -> dict:
    return {
        "id":              detail.get("id"),
        "title":           detail.get("title", ""),
        "location":        detail.get("location", ""),
        "year":            detail.get("year"),
        "month":           detail.get("month", ""),
        "test_type":       detail.get("test_type", ""),
        "content_type":    detail.get("content_type", ""),
        "total_questions": n_questions,
        "file":            filename,
    }


if __name__ == "__main__":
    main()

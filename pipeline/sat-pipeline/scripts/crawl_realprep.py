#!/usr/bin/env python3
"""
Scrape Real Prep Plus SAT quizzes into local HTML + JSON files.

The question-bank and test pages are WordPress/LearnDash pages. Their public
HTML contains the course index, quiz URLs, quiz IDs, and each quiz page contains
the rendered question text and choices.

Usage:
    cd pipeline/sat-pipeline
    python3 scripts/crawl_realprep.py --listing-only
    python3 scripts/crawl_realprep.py --quiz-limit 3
    python3 scripts/crawl_realprep.py
    python3 scripts/crawl_realprep.py --tests --pdf

Output:
    output/realprep/html/index.html
    output/realprep/html/quizzes/<quiz_id>_<slug>.html
    output/realprep/raw/<quiz_id>_<slug>.json
    output/realprep/index.json
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup, Tag

BASE_URL = "https://realprep.plus"
QUESTION_BANK_URL = f"{BASE_URL}/sat-question-bank-real-prep-plus/"
TESTS_URL = f"{BASE_URL}/real-prep-plus-digital-sat-tests/"
AJAX_URL = f"{BASE_URL}/wp-admin/admin-ajax.php"

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
OUTPUT_DIR = ROOT_DIR / "output" / "realprep"
HTML_DIR = OUTPUT_DIR / "html"
QUIZ_HTML_DIR = HTML_DIR / "quizzes"
RAW_DIR = OUTPUT_DIR / "raw"
INDEX_PATH = OUTPUT_DIR / "index.json"
LISTING_URL = QUESTION_BANK_URL
SOURCE_NAME = "realprep"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
)
PRIVATE_HEADERS_PATH = ROOT_DIR / "realprep_headers.json"


@dataclass
class QuizRef:
    quiz_id: int | None
    title: str
    url: str
    subject: str | None
    course_id: str
    course_title: str
    section: str
    locked: bool
    order: int


@dataclass
class CourseRef:
    course_id: str
    title: str
    section: str
    count_label: str
    locked: bool
    is_free: bool
    quizzes: list[QuizRef] = field(default_factory=list)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Real Prep Plus SAT quizzes.")
    parser.add_argument("--url", help="Listing URL to scrape")
    parser.add_argument(
        "--tests",
        action="store_true",
        help="Scrape the Real Prep Plus Digital SAT Tests page",
    )
    parser.add_argument(
        "--output-dir",
        help="Output directory. Defaults to output/realprep or output/realprep_tests.",
    )
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between quiz requests")
    parser.add_argument(
        "--listing-only",
        action="store_true",
        help="Only save and parse the index page",
    )
    parser.add_argument("--quiz-limit", type=int, help="Only fetch the first N quiz pages")
    parser.add_argument(
        "--start-at",
        type=int,
        default=1,
        help="Start at this 1-based quiz position after filtering. Useful for resuming a crawl.",
    )
    parser.add_argument(
        "--quiz-id",
        type=int,
        action="append",
        help="Only fetch this quiz ID; repeatable",
    )
    parser.add_argument("--force", action="store_true", help="Refetch quiz HTML even when cached")
    parser.add_argument(
        "--force-listing",
        action="store_true",
        help="Refetch the listing page even when a cached copy exists",
    )
    parser.add_argument(
        "--headers-file",
        default=str(PRIVATE_HEADERS_PATH),
        help="JSON file with private authenticated headers. Defaults to ignored realprep_headers.json",
    )
    parser.add_argument(
        "--skip-answers",
        action="store_true",
        help="Do not call LearnDash checkAnswers to resolve answer keys",
    )
    parser.add_argument(
        "--submit-modules",
        action="store_true",
        help="Call the LearnDash checkAnswers submit API and store a submission summary",
    )
    parser.add_argument("--pdf", action="store_true", help="Convert scraped quiz JSON files to PDF")
    parser.add_argument(
        "--include-empty-pdf",
        action="store_true",
        help="Render PDFs even for quizzes with zero parsed questions",
    )
    parser.add_argument(
        "--review-html",
        action="store_true",
        help="Also try the LearnDash review AJAX HTML",
    )
    args = parser.parse_args()

    args.url = args.url or (TESTS_URL if args.tests else QUESTION_BANK_URL)
    configure_output_paths(args.url, args.output_dir)
    _ensure_dirs()
    client = _client(args.headers_file)

    print(f"Fetching listing: {args.url}")
    listing_path = HTML_DIR / "index.html"
    if listing_path.exists() and not args.force_listing:
        listing_html = listing_path.read_text(encoding="utf-8")
        print(f"Using cached listing: {listing_path}")
    else:
        listing_html = _get_text(client, args.url)
        listing_path.write_text(listing_html, encoding="utf-8")

    courses = parse_listing(listing_html)
    quizzes = [quiz for course in courses for quiz in course.quizzes]
    print(f"Found {len(courses)} courses and {len(quizzes)} quiz links.")

    selected = quizzes
    if args.quiz_id:
        ids = set(args.quiz_id)
        selected = [quiz for quiz in selected if quiz.quiz_id in ids]
        print(f"Filtered to {len(selected)} quiz(es) by --quiz-id.")
    if args.quiz_limit is not None:
        selected = selected[: args.quiz_limit]
        print(f"Limited to {len(selected)} quiz(es).")
    start_at = max(args.start_at, 1)
    if start_at > 1:
        original_count = len(selected)
        selected = selected[start_at - 1 :]
        print(f"Resuming at quiz position {start_at}; {len(selected)}/{original_count} quiz(es) remaining.")

    quiz_outputs: list[dict[str, Any]] = []
    if not args.listing_only:
        for idx, quiz in enumerate(selected, start=start_at):
            quiz_label = f"{quiz.course_title} / {quiz.title}"
            total_count = len(selected) + start_at - 1
            print(f"[{idx:3}/{total_count}] #{quiz.quiz_id or 'unknown'} {quiz_label}")
            quiz_outputs.append(
                fetch_and_parse_quiz(
                    client,
                    quiz,
                    force=args.force,
                    fetch_answers=not args.skip_answers,
                    submit_module=args.submit_modules,
                )
            )

            if args.review_html and quiz.quiz_id is not None:
                review = fetch_review_html(client, quiz.quiz_id)
                if review:
                    review_path = HTML_DIR / "review" / f"{quiz.quiz_id}_{_slug(quiz.title)}.html"
                    review_path.parent.mkdir(parents=True, exist_ok=True)
                    review_path.write_text(review, encoding="utf-8")

            if idx < len(selected):
                time.sleep(args.delay)

    write_index(courses, quiz_outputs)
    if args.pdf and quiz_outputs:
        write_pdfs(quiz_outputs, include_empty=args.include_empty_pdf)

    print(f"Saved index: {INDEX_PATH}")
    print(f"Raw HTML:    {HTML_DIR}")
    print(f"Quiz JSON:   {RAW_DIR}")


def configure_output_paths(url: str, output_dir: str | None) -> None:
    global OUTPUT_DIR, HTML_DIR, QUIZ_HTML_DIR, RAW_DIR, INDEX_PATH, LISTING_URL, SOURCE_NAME

    LISTING_URL = url
    is_tests = "real-prep-plus-digital-sat-tests" in url
    SOURCE_NAME = "realprep_tests" if is_tests else "realprep"
    OUTPUT_DIR = Path(output_dir) if output_dir else ROOT_DIR / "output" / SOURCE_NAME
    HTML_DIR = OUTPUT_DIR / "html"
    QUIZ_HTML_DIR = HTML_DIR / "quizzes"
    RAW_DIR = OUTPUT_DIR / "raw"
    INDEX_PATH = OUTPUT_DIR / "index.json"


def _ensure_dirs() -> None:
    HTML_DIR.mkdir(parents=True, exist_ok=True)
    QUIZ_HTML_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def _client(headers_file: str | None = None) -> httpx.Client:
    headers = _realprep_headers(headers_file)
    return httpx.Client(
        follow_redirects=True,
        timeout=45,
        headers=headers,
    )


def _realprep_headers(headers_file: str | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Upgrade-Insecure-Requests": "1",
    }

    private_headers: dict[str, str] = {}
    env_headers = os.environ.get("REALPREP_HEADERS_JSON", "").strip()
    if env_headers:
        try:
            loaded = json.loads(env_headers)
            if isinstance(loaded, dict):
                private_headers.update({str(k): str(v) for k, v in loaded.items()})
        except json.JSONDecodeError as exc:
            raise RuntimeError("REALPREP_HEADERS_JSON is not valid JSON") from exc

    header_path = Path(headers_file) if headers_file else PRIVATE_HEADERS_PATH
    if header_path.exists():
        loaded = json.loads(header_path.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise RuntimeError(f"{header_path} must contain a JSON object")
        private_headers.update({str(k): str(v) for k, v in loaded.items()})

    cookie = os.environ.get("REALPREP_COOKIE", "").strip()
    if cookie:
        private_headers["Cookie"] = cookie

    headers.update(_normalize_headers(private_headers))
    # Let httpx negotiate encodings it supports. Passing browser br/zstd values
    # can produce compressed bodies unavailable to this runtime.
    headers.pop("Accept-Encoding", None)
    return headers


def _normalize_headers(headers: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    skip = {":authority", ":method", ":path", ":scheme", "host", "content-length"}
    for key, value in headers.items():
        name = key.strip()
        if not name or name.lower() in skip:
            continue
        normalized["-".join(part.capitalize() for part in name.split("-"))] = value.strip()
    return normalized


def _get_text(client: httpx.Client, url: str) -> str:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = client.get(url)
            response.raise_for_status()
            return response.text
        except Exception as exc:
            last_error = exc
            print(f"  attempt {attempt} failed: {exc}", file=sys.stderr)
            time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"Could not fetch {url}") from last_error


def _post_ajax_with_retry(
    client: httpx.Client,
    url: str,
    *,
    data: dict[str, Any],
    headers: dict[str, str] | None = None,
    label: str = "ajax",
) -> httpx.Response:
    last_response: httpx.Response | None = None
    last_error: Exception | None = None
    retry_statuses = {429, 500, 502, 503, 504}
    for attempt in range(1, 6):
        try:
            response = client.post(url, data=data, headers=headers)
            if response.status_code not in retry_statuses:
                response.raise_for_status()
                return response
            last_response = response
            print(f"      {label}: retry {attempt}/5 after HTTP {response.status_code}")
        except httpx.HTTPError as exc:
            last_error = exc
            print(f"      {label}: retry {attempt}/5 after {exc}")
        time.sleep(min(2 ** attempt, 20))

    if last_response is not None:
        last_response.raise_for_status()
    raise RuntimeError(f"{label}: AJAX request failed") from last_error


def parse_listing(document: str) -> list[CourseRef]:
    soup = BeautifulSoup(document, "html.parser")
    section_by_course_id = _sidebar_sections(soup)
    courses: list[CourseRef] = []

    for course_view in soup.select(".v2-course-view"):
        course_id = course_view.get("id", "")
        course_link = soup.select_one(f'.v2-course-link[data-target="{course_id}"]')
        course_title = (
            _clean_text(course_link.select_one(".v2-link-text")) if course_link else course_id
        )
        section = section_by_course_id.get(course_id, "Unknown")
        count_label = _clean_text(course_link.select_one(".tz-course-count")) if course_link else ""
        is_free = course_link.select_one(".v2-free-badge") is not None if course_link else False
        locked = course_view.select_one(".v2-blur, .v2-locked-overlay") is not None

        review_ids = _review_ids_for_course(course_view)
        quizzes: list[QuizRef] = []
        for order, anchor in enumerate(course_view.select("a.v2-quiz-pill[href]"), start=1):
            subject_group = anchor.find_parent(class_="v2-subject-group")
            subject = subject_group.get("data-subject") if isinstance(subject_group, Tag) else None
            title = _clean_text(anchor) or f"Quiz {order}"
            url = anchor["href"]
            quiz_id = (
                review_ids[order - 1].get("id")
                if order - 1 < len(review_ids)
                else _quiz_id_from_url(url)
            )

            quizzes.append(
                QuizRef(
                    quiz_id=int(quiz_id) if quiz_id else None,
                    title=title,
                    url=url,
                    subject=subject,
                    course_id=course_id,
                    course_title=course_title,
                    section=section,
                    locked=locked,
                    order=order,
                )
            )

        courses.append(
            CourseRef(
                course_id=course_id,
                title=course_title,
                section=section,
                count_label=count_label,
                locked=locked,
                is_free=is_free,
                quizzes=quizzes,
            )
        )

    return courses


def _sidebar_sections(soup: BeautifulSoup) -> dict[str, str]:
    section_by_course_id: dict[str, str] = {}
    for section_el in soup.select(".v2-sb-section"):
        header = _clean_text(section_el.select_one(".v2-sb-sec-header span")) or "Unknown"
        for link in section_el.select(".v2-course-link[data-target]"):
            section_by_course_id[link["data-target"]] = header
    return section_by_course_id


def _review_ids_for_course(course_view: Tag) -> list[dict[str, Any]]:
    button = course_view.select_one(".v2-btn-review[data-rev]")
    if not button:
        return []
    try:
        return json.loads(html.unescape(button["data-rev"]))
    except json.JSONDecodeError:
        return []


def fetch_and_parse_quiz(
    client: httpx.Client,
    quiz: QuizRef,
    force: bool,
    fetch_answers: bool,
    submit_module: bool,
) -> dict[str, Any]:
    filename = _quiz_filename(quiz)
    html_path = QUIZ_HTML_DIR / f"{filename}.html"
    json_path = RAW_DIR / f"{filename}.json"

    if html_path.exists() and not force:
        document = html_path.read_text(encoding="utf-8")
    else:
        document = _get_text(client, quiz.url)
        html_path.write_text(document, encoding="utf-8")

    parsed = parse_quiz(document, quiz)
    if not parsed["questions"]:
        loaded = fetch_quiz_load_data(client, parsed)
        loaded_content = loaded.get("content") if isinstance(loaded, dict) else None
        if isinstance(loaded_content, str) and "wpProQuiz_listItem" in loaded_content:
            document = f"{document}\n{loaded_content}"
            html_path.write_text(document, encoding="utf-8")
            parsed = parse_quiz(document, quiz)
            settings = parsed.get("learndash") or {}
            if isinstance(loaded.get("json"), dict):
                settings["questions"] = loaded["json"]
            if loaded.get("globalPoints") is not None:
                settings["globalPoints"] = loaded["globalPoints"]
            if isinstance(loaded.get("catPoints"), dict):
                settings["catPoints"] = loaded["catPoints"]

    parsed["access_status"] = detect_access_status(document, parsed)
    if fetch_answers or submit_module:
        answers, summary = submit_check_answers(client, parsed)
        answer_payload_for_completion = answers
        completion_summary: dict[str, Any] = {}
        if submit_module and answers:
            correct_responses = _build_correct_responses(parsed, answers)
            if correct_responses:
                correct_answers, correct_summary = submit_check_answers(
                    client,
                    parsed,
                    responses=correct_responses,
                    label="submit-correct",
                )
                if correct_answers:
                    answer_payload_for_completion = correct_answers
                if correct_summary:
                    summary["correct_check"] = correct_summary
            completion_summary = submit_completed_quiz(client, parsed, answer_payload_for_completion)
        if summary:
            parsed["submission"] = summary
            if completion_summary:
                parsed["submission"]["completion"] = completion_summary
        if fetch_answers and answers and parsed["questions"]:
            apply_answer_key(parsed, answers)

    parsed["html_file"] = str(html_path.relative_to(OUTPUT_DIR))
    parsed["json_file"] = str(json_path.relative_to(OUTPUT_DIR))
    parsed["fetched_at"] = datetime.now(timezone.utc).isoformat()
    json_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"      questions: {len(parsed['questions'])} -> {json_path}")
    return parsed


def parse_quiz(document: str, quiz: QuizRef) -> dict[str, Any]:
    soup = BeautifulSoup(document, "html.parser")
    title = _clean_text(soup.select_one("h1.entry-title, .entry-title")) or quiz.title
    quiz_meta = _parse_json_attr(
        soup.select_one(".wpProQuiz_content[data-quiz-meta]"),
        "data-quiz-meta",
    )
    quiz_settings = _extract_quiz_settings(document)

    questions: list[dict[str, Any]] = []
    for idx, item in enumerate(soup.select("li.wpProQuiz_listItem"), start=1):
        question_meta = _parse_json_attr(item, "data-question-meta")
        category = _extract_category(item)
        question_el = item.select_one(".wpProQuiz_question_text")
        choices = _extract_choices(item)

        questions.append(
            {
                "number": idx,
                "question_pro_id": question_meta.get("question_pro_id"),
                "question_post_id": question_meta.get("question_post_id"),
                "type": question_meta.get("type") or item.get("data-type"),
                "category": category,
                "question_html": _inner_html(question_el),
                "question_text": _clean_text(question_el),
                "choices": choices,
                "correct_answer": None,
                "explanation_html": _inner_html(item.select_one(".wpProQuiz_AnswerMessage")),
            }
        )

    return {
        "source": SOURCE_NAME,
        "quiz_id": quiz.quiz_id,
        "quiz_pro_id": quiz_meta.get("quiz_pro_id"),
        "learndash": quiz_settings,
        "title": title,
        "list_title": quiz.title,
        "url": quiz.url,
        "section": quiz.section,
        "course_id": quiz.course_id,
        "course_title": quiz.course_title,
        "subject": quiz.subject,
        "locked_from_listing": quiz.locked,
        "questions": questions,
    }


def detect_access_status(document: str, parsed: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(BeautifulSoup(document, "html.parser").get_text(" ", strip=True).split())
    has_questions = bool(parsed.get("questions"))
    no_access_patterns = [
        "You don't currently have access to this content",
        "Current Status Not Enrolled",
        "Enroll in this practice exam to get access",
        "This practice exam is currently closed",
        "Please go back and complete the previous practice module",
    ]
    matched = [pattern for pattern in no_access_patterns if pattern in text]
    return {
        "has_questions": has_questions,
        "status": "ok" if has_questions else ("no_access_or_not_enrolled" if matched else "no_questions_found"),
        "matched_messages": matched,
    }


def _extract_category(item: Tag) -> str | None:
    for div in item.find_all("div"):
        text = _clean_text(div)
        if text.startswith("Category:"):
            return text.removeprefix("Category:").strip()
    return None


def _extract_choices(item: Tag) -> list[dict[str, Any]]:
    choices = []
    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for idx, choice in enumerate(item.select(".wpProQuiz_questionListItem"), start=0):
        label_el = choice.select_one("label")
        input_el = choice.select_one("input")
        clean_label = _clone_without_noise(label_el)
        choices.append(
            {
                "label": labels[idx] if idx < len(labels) else str(idx + 1),
                "value": input_el.get("value") if input_el else None,
                "html": _inner_html(clean_label),
                "text": _clean_text(clean_label),
                "is_correct": False,
            }
        )
    return choices


def _extract_quiz_settings(document: str) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    for key in ("course_id", "lesson_id", "topic_id", "quiz", "quizId", "user_id"):
        match = re.search(rf"\b{key}:\s*(\d+)", document)
        if match:
            settings[key] = int(match.group(1))

    nonce_match = re.search(r"quiz_nonce:\s*'([^']+)'", document)
    if nonce_match:
        settings["quiz_nonce"] = nonce_match.group(1)

    resume_match = re.search(r"quiz_resume_data:\s*'([^']*)'", document)
    if resume_match:
        settings["quiz_resume_data"] = html.unescape(resume_match.group(1)) or "[]"
    else:
        settings["quiz_resume_data"] = "[]"

    questions_match = re.search(
        r"\bjson:\s*(\{.*?\}),\s*\n\s*ld_script_debug",
        document,
        flags=re.S,
    )
    if questions_match:
        try:
            settings["questions"] = json.loads(questions_match.group(1))
        except json.JSONDecodeError:
            settings["questions"] = {}
    else:
        settings["questions"] = {}

    return settings


def submit_check_answers(
    client: httpx.Client,
    quiz_data: dict[str, Any],
    responses: dict[str, Any] | None = None,
    label: str = "submit",
) -> tuple[dict[str, Any], dict[str, Any]]:
    settings = quiz_data.get("learndash") or {}
    required = ("course_id", "quiz", "quizId", "quiz_nonce")
    if any(settings.get(key) in (None, "") for key in required):
        print(f"      {label}: skipped (missing LearnDash settings)")
        return {}, {"status": "skipped", "reason": "missing_learndash_settings"}

    responses = responses or _build_empty_responses(quiz_data)
    if not responses:
        print(f"      {label}: skipped (no response payload)")
        return {}, {"status": "skipped", "reason": "no_response_payload"}

    response = _post_ajax_with_retry(
        client,
        AJAX_URL,
        data={
            "action": "ld_adv_quiz_pro_ajax",
            "func": "checkAnswers",
            "data[course_id]": str(settings["course_id"]),
            "data[quiz_nonce]": str(settings["quiz_nonce"]),
            "data[quiz_started]": str(_quiz_started_ms(quiz_data)),
            "data[quiz]": str(settings["quiz"]),
            "data[quizId]": str(settings["quizId"]),
            "data[responses]": json.dumps(responses, separators=(",", ":")),
            "data[quiz_resume_data]": str(settings.get("quiz_resume_data") or "[]"),
            "quiz": str(settings["quiz"]),
            "course_id": str(settings["course_id"]),
            "quiz_nonce": str(settings["quiz_nonce"]),
        },
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": str(quiz_data.get("url") or BASE_URL),
            "X-Requested-With": "XMLHttpRequest",
        },
        label=label,
    )

    try:
        payload = response.json()
    except json.JSONDecodeError:
        print(f"      {label}: skipped (non-JSON response)")
        return {}, {
            "status": "skipped",
            "reason": "non_json_response",
            "http_status": response.status_code,
        }

    if not isinstance(payload, dict):
        print(f"      {label}: skipped (unexpected response)")
        return {}, {
            "status": "skipped",
            "reason": "unexpected_response",
            "http_status": response.status_code,
        }

    resolved = sum(1 for value in payload.values() if _answer_value(value))
    print(f"      {label}: {len(responses)} responses, {resolved} answers resolved")
    return payload, {
        "status": "ok",
        "endpoint": AJAX_URL,
        "action": "ld_adv_quiz_pro_ajax",
        "func": "checkAnswers",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "http_status": response.status_code,
        "quiz": settings["quiz"],
        "quizId": settings["quizId"],
        "course_id": settings["course_id"],
        "response_count": len(responses),
        "payload_item_count": len(payload),
        "resolved_answer_count": resolved,
    }


def fetch_quiz_load_data(client: httpx.Client, quiz_data: dict[str, Any]) -> dict[str, Any]:
    settings = quiz_data.get("learndash") or {}
    required = ("quiz", "quizId", "quiz_nonce")
    if any(settings.get(key) in (None, "") for key in required):
        return {}
    response = _post_ajax_with_retry(
        client,
        AJAX_URL,
        data={
            "action": "wp_pro_quiz_admin_ajax_load_data",
            "func": "quizLoadData",
            "data[quizId]": str(settings["quizId"]),
            "data[quiz]": str(settings["quiz"]),
            "data[quiz_nonce]": str(settings["quiz_nonce"]),
            "quiz": str(settings["quiz"]),
            "course_id": str(settings.get("course_id") or ""),
            "quiz_nonce": str(settings["quiz_nonce"]),
        },
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": str(quiz_data.get("url") or BASE_URL),
            "X-Requested-With": "XMLHttpRequest",
        },
        label="quizLoadData",
    )
    if response.status_code >= 400:
        return {}
    try:
        payload = response.json()
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def submit_completed_quiz(
    client: httpx.Client,
    quiz_data: dict[str, Any],
    answer_payload: dict[str, Any],
) -> dict[str, Any]:
    settings = quiz_data.get("learndash") or {}
    required = ("course_id", "lesson_id", "topic_id", "quiz", "quizId", "quiz_nonce")
    if any(settings.get(key) in (None, "") for key in required):
        print("      complete: skipped (missing LearnDash settings)")
        return {"status": "skipped", "reason": "missing_learndash_settings"}

    results = _build_completed_results(quiz_data, answer_payload)
    if not results:
        print("      complete: skipped (no results payload)")
        return {"status": "skipped", "reason": "no_results_payload"}

    timespent = int((results.get("comp") or {}).get("quizTime") or 0)
    response = _post_ajax_with_retry(
        client,
        AJAX_URL,
        data={
            "action": "wp_pro_quiz_completed_quiz",
            "course_id": str(settings["course_id"]),
            "lesson_id": str(settings["lesson_id"]),
            "topic_id": str(settings["topic_id"]),
            "quiz": str(settings["quiz"]),
            "quizId": str(settings["quizId"]),
            "results": json.dumps(results, separators=(",", ":")),
            "timespent": str(timespent),
            "forms": json.dumps({}, separators=(",", ":")),
            "quiz_nonce": str(settings["quiz_nonce"]),
        },
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": str(quiz_data.get("url") or BASE_URL),
            "X-Requested-With": "XMLHttpRequest",
        },
        label="complete",
    )

    try:
        payload = response.json()
    except json.JSONDecodeError:
        print("      complete: skipped (non-JSON response)")
        return {
            "status": "skipped",
            "reason": "non_json_response",
            "http_status": response.status_code,
        }

    success = isinstance(payload, dict)
    print(f"      complete: {'ok' if success else 'unexpected response'}")
    return {
        "status": "ok" if success else "skipped",
        "endpoint": AJAX_URL,
        "action": "wp_pro_quiz_completed_quiz",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "http_status": response.status_code,
        "quiz": settings["quiz"],
        "quizId": settings["quizId"],
        "course_id": settings["course_id"],
        "result_item_count": len(results) - 1,
        "points": (results.get("comp") or {}).get("points", 0),
        "result_percent": (results.get("comp") or {}).get("result", 0),
    }


def _build_empty_responses(quiz_data: dict[str, Any]) -> dict[str, Any]:
    settings_questions = (quiz_data.get("learndash") or {}).get("questions") or {}
    responses: dict[str, Any] = {}
    for question in quiz_data.get("questions", []):
        question_pro_id = question.get("question_pro_id")
        if question_pro_id is None:
            continue
        qid = str(question_pro_id)
        settings_meta = settings_questions.get(qid) or {}
        choice_count = max(len(question.get("choices", [])), 1)
        responses[qid] = {
            "response": {str(index): False for index in range(choice_count)},
            "question_pro_id": int(question_pro_id),
            "question_post_id": question.get("question_post_id")
            or settings_meta.get("question_post_id"),
        }
    if responses:
        return responses

    for qid, settings_meta in settings_questions.items():
        if not isinstance(settings_meta, dict):
            continue
        question_pro_id = settings_meta.get("id") or qid
        question_post_id = settings_meta.get("question_post_id")
        if question_pro_id is None or question_post_id is None:
            continue
        responses[str(question_pro_id)] = {
            "response": {str(index): False for index in range(4)},
            "question_pro_id": int(question_pro_id),
            "question_post_id": question_post_id,
        }
    return responses


def fetch_answer_key(client: httpx.Client, quiz_data: dict[str, Any]) -> dict[str, Any]:
    answers, _summary = submit_check_answers(client, quiz_data)
    return answers


def _build_correct_responses(
    quiz_data: dict[str, Any],
    answer_payload: dict[str, Any],
) -> dict[str, Any]:
    responses = _build_empty_responses(quiz_data)
    for qid, response in responses.items():
        answer_data = answer_payload.get(qid) or {}
        answer_meta = answer_data.get("e") or {}
        correct = answer_meta.get("c")
        if isinstance(correct, list):
            response["response"] = {
                str(index): bool(value)
                for index, value in enumerate(correct)
            }
    return responses


def _build_completed_results(
    quiz_data: dict[str, Any],
    answer_payload: dict[str, Any],
) -> dict[str, Any]:
    started_ms = _quiz_started_ms(quiz_data)
    ended_ms = int(time.time() * 1000)
    quiz_time = max(int((ended_ms - started_ms) / 1000), 1)
    results: dict[str, Any] = {
        "comp": {
            "points": 0,
            "correctQuestions": 0,
            "quizTime": quiz_time,
            "quizStartTimestamp": started_ms,
            "quizEndTimestamp": ended_ms,
            "result": 0,
        }
    }
    cat_points: dict[str, float] = {}

    questions = quiz_data.get("questions") or []
    for question in questions:
        question_pro_id = question.get("question_pro_id")
        if question_pro_id is None:
            continue
        qid = str(question_pro_id)
        answer_data = answer_payload.get(qid) or {}
        if not isinstance(answer_data, dict):
            answer_data = {}
        answer_meta = answer_data.get("e") or {}
        possible_points = _number(answer_meta.get("possiblePoints"), default=1)
        completion_data = _completion_answer_data(question, answer_data)
        correct = 1 if completion_data else (1 if bool(answer_data.get("c")) else 0)
        points = possible_points if correct else _number(answer_data.get("p"))
        question_result = {
            "time": 0,
            "points": points,
            "p_nonce": answer_data.get("p_nonce") or "",
            "correct": correct,
            "data": completion_data or answer_data.get("s") or _selected_answer_data(question),
            "a_nonce": answer_data.get("a_nonce") or "",
            "possiblePoints": possible_points,
        }
        if answer_meta.get("graded_id"):
            question_result["graded_id"] = answer_meta.get("graded_id")
        if answer_meta.get("graded_status"):
            question_result["graded_status"] = answer_meta.get("graded_status")
        results[str(question_pro_id)] = question_result
        results["comp"]["points"] = round(results["comp"]["points"] + points, 2)
        results["comp"]["correctQuestions"] += correct
        category = question.get("category")
        if category:
            cat_points[category] = round(cat_points.get(category, 0) + points, 2)

    global_points = sum(
        _number((answer.get("e") or {}).get("possiblePoints"), default=1)
        for answer in answer_payload.values()
        if isinstance(answer, dict)
    )
    if global_points:
        results["comp"]["result"] = round(results["comp"]["points"] / global_points * 100, 2)
    if cat_points:
        results["comp"]["cats"] = cat_points
    return results


def _selected_answer_data(question: dict[str, Any]) -> dict[str, int]:
    return {str(index): 0 for index, _choice in enumerate(question.get("choices", []))}


def _completion_answer_data(
    question: dict[str, Any],
    answer_data: dict[str, Any],
) -> dict[str, int] | dict[str, str]:
    answer_meta = answer_data.get("e") or {}
    answer_type = answer_meta.get("type") or question.get("type")
    correct = answer_meta.get("c")
    if answer_type in {"single", "multiple"} and isinstance(correct, list):
        return {
            str(index): 1 if bool(value) else 0
            for index, value in enumerate(correct)
        }
    return {}


def _quiz_started_ms(_quiz_data: dict[str, Any]) -> int:
    return int(time.time() * 1000) - 1000


def _number(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def apply_answer_key(quiz_data: dict[str, Any], answer_payload: dict[str, Any]) -> None:
    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for question in quiz_data.get("questions", []):
        qid = str(question.get("question_pro_id") or "")
        answer_data = answer_payload.get(qid) or {}
        answer_type = (answer_data.get("e") or {}).get("type") or question.get("type")
        answer_value = _answer_value(answer_data)
        correct_indices = _correct_indices(answer_data)
        correct_labels = [
            labels[index] if index < len(labels) else str(index + 1)
            for index in correct_indices
        ]

        for index, choice in enumerate(question.get("choices", [])):
            choice["is_correct"] = answer_type != "cloze_answer" and index in correct_indices

        if answer_value:
            question["correct_answer"] = answer_value
        elif len(correct_labels) == 1:
            question["correct_answer"] = correct_labels[0]
        elif correct_labels:
            question["correct_answer"] = correct_labels

        explanation = ((answer_data.get("e") or {}).get("AnswerMessage") or "").strip()
        if explanation:
            question["explanation_html"] = explanation


def _correct_indices(answer_data: Any) -> list[int]:
    if not isinstance(answer_data, dict):
        return []
    answer_meta = answer_data.get("e") or {}
    if answer_meta.get("type") == "cloze_answer":
        return []
    result = answer_meta.get("c") or []
    return [index for index, value in enumerate(result) if bool(value)]


def _answer_value(answer_data: Any) -> str:
    if not isinstance(answer_data, dict):
        return ""

    answer_meta = answer_data.get("e") or {}
    correct = answer_meta.get("c") or []
    if answer_meta.get("type") == "cloze_answer":
        blank_answers: list[str] = []
        for blank in correct:
            if isinstance(blank, list):
                values = [str(value).strip() for value in blank if str(value).strip()]
                if values:
                    blank_answers.append(" / ".join(values))
            elif str(blank).strip():
                blank_answers.append(str(blank).strip())
        return "; ".join(blank_answers)

    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    correct_indices = [index for index, value in enumerate(correct) if bool(value)]
    correct_labels = [
        labels[index] if index < len(labels) else str(index + 1)
        for index in correct_indices
    ]
    return ", ".join(correct_labels)


def _clone_without_noise(tag: Tag | None) -> Tag | None:
    if tag is None:
        return None
    clone_soup = BeautifulSoup(str(tag), "html.parser")
    clone = clone_soup.find(tag.name)
    if clone is None:
        return None
    for node in clone.select("input, .ld-quiz-question-item__status"):
        node.decompose()
    for node in clone.select("span"):
        if "display:none" in (node.get("style") or "").replace(" ", ""):
            node.decompose()
    return clone


def fetch_review_html(client: httpx.Client, quiz_id: int) -> str | None:
    response = client.post(
        AJAX_URL,
        data={"action": "ld_get_sat_review_v2", "quiz_id": str(quiz_id)},
    )
    if response.status_code >= 400:
        return None
    try:
        payload = response.json()
    except json.JSONDecodeError:
        return None
    if payload.get("success") and isinstance(payload.get("data"), dict):
        review_html = payload["data"].get("html")
        return review_html if isinstance(review_html, str) else None
    return None


def write_index(courses: list[CourseRef], quiz_outputs: list[dict[str, Any]]) -> None:
    all_quizzes = [quiz for course in courses for quiz in course.quizzes]
    INDEX_PATH.write_text(
        json.dumps(
            {
                "source": SOURCE_NAME,
                "url": LISTING_URL,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "total_courses": len(courses),
                "total_quizzes": len(all_quizzes),
                "scraped_quizzes": len(quiz_outputs),
                "scraped_questions": sum(len(item.get("questions", [])) for item in quiz_outputs),
                "courses": [asdict(course) for course in courses],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def write_pdfs(
    quiz_outputs: list[dict[str, Any]],
    include_empty: bool,
) -> None:
    from playwright.sync_api import sync_playwright
    from scripts.realprep_to_pdf import build_pdf_bytes

    pdf_dir = OUTPUT_DIR / "pdf"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    print(f"Rendering PDFs: {pdf_dir}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for quiz in quiz_outputs:
            if not include_empty and not quiz.get("questions"):
                print(f"      pdf skip empty -> #{quiz.get('quiz_id') or 'unknown'}")
                continue
            json_file = quiz.get("json_file")
            stem = Path(str(json_file)).stem if json_file else str(quiz.get("quiz_id") or "quiz")
            pdf_path = pdf_dir / f"{stem}.pdf"
            pdf_path.write_bytes(build_pdf_bytes(quiz, page))
            print(f"      pdf -> {pdf_path}")
        browser.close()


def _parse_json_attr(tag: Tag | None, attr: str) -> dict[str, Any]:
    if tag is None or not tag.has_attr(attr):
        return {}
    try:
        return json.loads(html.unescape(tag[attr]))
    except json.JSONDecodeError:
        return {}


def _quiz_id_from_url(url: str) -> int | None:
    match = re.search(r"/(?:quiz|quizzes)/[^/]+/(?:\\?.*)?$", urlparse(url).path)
    if not match:
        return None
    return None


def _quiz_filename(quiz: QuizRef) -> str:
    path_slug = _url_slug(quiz.url)
    url_hash = hashlib.sha1(quiz.url.encode("utf-8")).hexdigest()[:10]
    title_slug = _slug(f"{quiz.course_title}_{quiz.title}_{path_slug}")
    return f"{quiz.quiz_id or 'unknown'}_{title_slug}_{url_hash}"


def _url_slug(url: str) -> str:
    parts = [part for part in urlparse(url).path.split("/") if part]
    if not parts:
        return "quiz"
    return "_".join(parts[-4:])


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return slug[:90] or "untitled"


def _clean_text(tag: Tag | None) -> str:
    if tag is None:
        return ""
    return " ".join(tag.get_text(" ", strip=True).split())


def _inner_html(tag: Tag | None) -> str:
    if tag is None:
        return ""
    return "".join(str(child) for child in tag.contents).strip()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Scrape the Real Prep Plus SAT question bank into local HTML + JSON files.

The question-bank page is a WordPress/LearnDash page. Its public HTML contains
the course index, quiz URLs, quiz IDs, and each quiz page contains the rendered
question text and choices.

Usage:
    cd pipeline/sat-pipeline
    python3 scripts/crawl_realprep.py --listing-only
    python3 scripts/crawl_realprep.py --quiz-limit 3
    python3 scripts/crawl_realprep.py

Output:
    output/realprep/html/index.html
    output/realprep/html/quizzes/<quiz_id>_<slug>.html
    output/realprep/raw/<quiz_id>_<slug>.json
    output/realprep/index.json
"""

from __future__ import annotations

import argparse
import html
import json
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
AJAX_URL = f"{BASE_URL}/wp-admin/admin-ajax.php"

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
OUTPUT_DIR = ROOT_DIR / "output" / "realprep"
HTML_DIR = OUTPUT_DIR / "html"
QUIZ_HTML_DIR = HTML_DIR / "quizzes"
RAW_DIR = OUTPUT_DIR / "raw"
INDEX_PATH = OUTPUT_DIR / "index.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


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
    parser = argparse.ArgumentParser(description="Scrape Real Prep Plus SAT question bank.")
    parser.add_argument("--url", default=QUESTION_BANK_URL, help="Question-bank listing URL")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between quiz requests")
    parser.add_argument(
        "--listing-only",
        action="store_true",
        help="Only save and parse the index page",
    )
    parser.add_argument("--quiz-limit", type=int, help="Only fetch the first N quiz pages")
    parser.add_argument(
        "--quiz-id",
        type=int,
        action="append",
        help="Only fetch this quiz ID; repeatable",
    )
    parser.add_argument("--force", action="store_true", help="Refetch quiz HTML even when cached")
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

    _ensure_dirs()
    client = _client()

    print(f"Fetching listing: {args.url}")
    listing_html = _get_text(client, args.url)
    (HTML_DIR / "index.html").write_text(listing_html, encoding="utf-8")

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

    quiz_outputs: list[dict[str, Any]] = []
    if not args.listing_only:
        for idx, quiz in enumerate(selected, start=1):
            quiz_label = f"{quiz.course_title} / {quiz.title}"
            print(f"[{idx:3}/{len(selected)}] #{quiz.quiz_id or 'unknown'} {quiz_label}")
            quiz_outputs.append(fetch_and_parse_quiz(client, quiz, force=args.force))

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


def _ensure_dirs() -> None:
    HTML_DIR.mkdir(parents=True, exist_ok=True)
    QUIZ_HTML_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def _client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=True,
        timeout=45,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )


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


def fetch_and_parse_quiz(client: httpx.Client, quiz: QuizRef, force: bool) -> dict[str, Any]:
    filename = f"{quiz.quiz_id or 'unknown'}_{_slug(quiz.course_title + '_' + quiz.title)}"
    html_path = QUIZ_HTML_DIR / f"{filename}.html"
    json_path = RAW_DIR / f"{filename}.json"

    if html_path.exists() and not force:
        document = html_path.read_text(encoding="utf-8")
    else:
        document = _get_text(client, quiz.url)
        html_path.write_text(document, encoding="utf-8")

    parsed = parse_quiz(document, quiz)
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
        "source": "realprep",
        "quiz_id": quiz.quiz_id,
        "quiz_pro_id": quiz_meta.get("quiz_pro_id"),
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
            }
        )
    return choices


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
                "source": "realprep",
                "url": QUESTION_BANK_URL,
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


def write_pdfs(quiz_outputs: list[dict[str, Any]], include_empty: bool) -> None:
    from playwright.sync_api import sync_playwright
    from scripts.realprep_to_pdf import DEFAULT_OUTPUT_DIR, build_pdf_bytes

    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Rendering PDFs: {DEFAULT_OUTPUT_DIR}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for quiz in quiz_outputs:
            if not include_empty and not quiz.get("questions"):
                print(f"      pdf skip empty -> #{quiz.get('quiz_id') or 'unknown'}")
                continue
            json_file = quiz.get("json_file")
            stem = Path(str(json_file)).stem if json_file else str(quiz.get("quiz_id") or "quiz")
            pdf_path = DEFAULT_OUTPUT_DIR / f"{stem}.pdf"
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

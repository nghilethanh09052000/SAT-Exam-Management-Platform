#!/usr/bin/env python3
"""
json_to_pdf.py — Convert a raw SAT JSON file to a PDF with properly rendered math.

Uses Playwright (already a project dependency) to render an HTML page with
KaTeX, producing pixel-perfect equations identical to the web interface.

Usage:
    python scripts/json_to_pdf.py output/raw/30116.json
    python scripts/json_to_pdf.py output/raw/30116.json --output output/pdf/30116.pdf
    python scripts/json_to_pdf.py output/raw/30116.json --no-answer-key
    python scripts/json_to_pdf.py output/raw/30116.json --section "Math - Module 1"
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from utils.classifier import classify_question

# ---------------------------------------------------------------------------
# HTML template — KaTeX loaded from CDN, auto-renders all $...$ blocks
# ---------------------------------------------------------------------------

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>

  <!-- KaTeX -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
          onload="renderMathInElement(document.body, {{
            delimiters: [
              {{left: '$$', right: '$$', display: true}},
              {{left: '$',  right: '$',  display: false}}
            ],
            throwOnError: false
          }});"></script>

  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: 'Georgia', serif;
      font-size: 13pt;
      color: #1a1a1a;
      padding: 24px 48px;
      max-width: 820px;
      margin: 0 auto;
      line-height: 1.55;
    }}

    /* ── Cover ── */
    .cover {{
      text-align: center;
      margin-bottom: 36px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1a1a1a;
    }}
    .cover h1 {{ font-size: 20pt; margin-bottom: 6px; }}
    .cover .meta {{ font-size: 10pt; color: #666; }}

    /* ── Section header ── */
    .section-header {{
      font-size: 13pt;
      font-weight: bold;
      background: #f0f4ff;
      padding: 8px 14px;
      margin: 32px 0 20px;
      border-left: 5px solid #2563eb;
    }}

    /* ── Single question ── */
    .question {{
      margin-bottom: 32px;
      page-break-inside: avoid;
    }}

    .question-label {{
      font-weight: bold;
      font-size: 12pt;
      margin-bottom: 10px;
    }}

    /* ── Passage ── */
    .passage {{
      margin: 0 0 14px 0;
      padding: 10px 14px;
      background: #f8f8f8;
      border-left: 3px solid #bbb;
      font-size: 11pt;
      line-height: 1.6;
    }}

    /* ── Question body ── */
    .question-content {{
      margin: 0 0 12px 0;
      line-height: 1.6;
    }}
    .question-content p {{ margin-bottom: 6px; }}
    .question-content img {{
      max-width: 100%;
      max-height: 300px;
      display: block;
      margin: 8px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
    }}

    /* ── MC options ── */
    .options {{
      margin-left: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}
    .option {{
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 6px 10px;
      border: 1.5px solid #d0d0d0;
      border-radius: 20px;
    }}
    .option-label {{
      font-weight: bold;
      font-size: 10pt;
      min-width: 18px;
      color: #333;
    }}

    /* ── MC options ── */
    .option.correct {{
      background: #f0fdf4;
      border-color: #4ade80;
    }}
    .option.correct .option-label {{
      color: #166534;
    }}
    .correct-marker {{
      margin-left: auto;
      font-size: 9pt;
      font-weight: 700;
      color: #16a34a;
      flex-shrink: 0;
    }}

    /* ── SPR answer box ── */
    .spr-box {{
      margin-left: 0;
      margin-top: 12px;
      display: inline-block;
      min-width: 120px;
      min-height: 36px;
      border: 1.5px solid #bbb;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 10pt;
      color: #999;
      font-style: italic;
    }}

    /* ── SPR correct answer reveal ── */
    .spr-answer {{
      margin: 10px 0 0 0;
      font-size: 10pt;
      font-weight: 600;
    }}

    /* ── Explanation ── */
    .explanation {{
      margin: 12px 0 0 0;
      padding: 10px 14px;
      background: #fffbeb;
      border-left: 3px solid #fcd34d;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #451a03;
    }}
    .explanation-label {{
      font-weight: 700;
      font-size: 9.5pt;
      color: #92400e;
      margin-bottom: 4px;
    }}

    /* ── Question metadata (category + difficulty) — plain text, parseable ── */
    .question-meta {{
      margin-top: 8px;
      font-size: 9.5pt;
      color: #444;
    }}

    .divider {{
      border: none;
      border-top: 1px dashed #ccc;
      margin: 24px 0 0;
    }}

    /* ── Answer key ── */
    .answer-key {{
      page-break-before: always;
      margin-top: 40px;
    }}
    .answer-key h2 {{
      font-size: 16pt;
      text-align: center;
      margin-bottom: 6px;
    }}
    .answer-key .section-label {{
      font-size: 11pt;
      font-weight: bold;
      color: #555;
      margin: 18px 0 10px;
    }}
    .answer-grid {{
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
    }}
    .answer-item {{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      background: #f6faf6;
      border: 1px solid #c8e6c9;
      border-radius: 4px;
    }}
    .answer-q {{
      font-weight: bold;
      font-size: 9.5pt;
      min-width: 22px;
      color: #444;
    }}
    .answer-v {{
      font-size: 9.5pt;
      color: #1a7a1a;
      font-weight: bold;
    }}
  </style>
</head>
<body>

<div class="cover">
  <h1>{title}</h1>
  <div class="meta">{meta}</div>
</div>

{body}

{answer_key}

</body>
</html>
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_html_tags(raw: str) -> str:
    """Return plain text from an HTML fragment (preserves LaTeX $...$)."""
    return BeautifulSoup(raw, "html.parser").get_text(separator=" ").strip()


def _sanitize_content(raw: str) -> str:
    """
    Pass HTML content straight through — KaTeX will render the math.
    Wrap bare text (no <p>) in a paragraph so spacing is consistent.
    """
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith("<"):
        raw = f"<p>{raw}</p>"
    return raw


def _build_question_html(q: dict, section: str = "rw") -> str:
    number     = q.get("number", "?")
    content    = _sanitize_content(q.get("content") or "")
    passage    = (q.get("passage") or "").strip()
    correct    = (q.get("correctAnswer") or "").strip()
    options: dict[str, str] = q.get("options") or {}
    difficulty = (q.get("difficulty") or "").strip()
    explanation = (
        q.get("explanation_text")
        or q.get("explanation")
        or ""
    ).strip()

    is_mc = any((options.get(lbl) or "").strip() for lbl in ["A", "B", "C", "D"])

    # ── Skill category (classifier or scraped domain) ──────────────────────
    raw_section: str = section if section in ("rw", "math") else "rw"
    category = classify_question(
        text=_strip_html_tags(q.get("content") or ""),
        section=raw_section,  # type: ignore[arg-type]
        domain=q.get("domain"),
    )

    parts: list[str] = [
        '<div class="question">',
        f'  <div class="question-label">Question {number}</div>',
    ]

    # ── Passage ────────────────────────────────────────────────────────────
    if passage:
        parts.append(f'  <div class="passage">{_sanitize_content(passage)}</div>')

    # ── Question stem ──────────────────────────────────────────────────────
    parts.append(f'  <div class="question-content">{content}</div>')

    # ── Options / SPR ──────────────────────────────────────────────────────
    if is_mc:
        parts.append('  <div class="options">')
        for label in ["A", "B", "C", "D"]:
            opt_text = options.get(label) or ""
            if not opt_text.strip():
                continue
            is_correct = correct.upper() == label
            css_cls    = ' correct' if is_correct else ''
            marker     = '<span class="correct-marker">&#10003; Correct</span>' if is_correct else ''
            opt_content = _sanitize_content(opt_text)
            parts.append(
                f'    <div class="option{css_cls}">'
                f'<span class="option-label">{label}</span>'
                f'<span>{opt_content}</span>'
                f'{marker}'
                f'</div>'
            )
        parts.append("  </div>")
    else:
        parts.append('  <div class="spr-box">Student-produced response</div>')
        if correct:
            parts.append(
                f'  <div class="spr-answer">'
                f'&#10003;&nbsp;Answer:&nbsp;<strong>{html.escape(correct)}</strong>'
                f'</div>'
            )

    # ── Explanation ────────────────────────────────────────────────────────
    if explanation:
        parts.append(
            f'  <div class="explanation">'
            f'<div class="explanation-label">Explanation</div>'
            f'{_sanitize_content(explanation)}'
            f'</div>'
        )

    # ── Metadata: category + difficulty (plain text, parseable) ───────────
    if category and category != "Uncategorized":
        parts.append(f'  <div class="question-meta">category: {html.escape(category)}</div>')
    if difficulty:
        parts.append(f'  <div class="question-meta">Difficulty: {html.escape(difficulty)}</div>')

    parts.append("</div>")
    parts.append('<hr class="divider" />')

    return "\n".join(parts)


def _build_answer_key_html(data: dict) -> str:
    parts = ['<div class="answer-key">', '<h2>Answer Key</h2>']

    for section in data.get("sections", []):
        section_name = section.get("name", "")
        parts.append(f'<div class="section-label">{html.escape(section_name)}</div>')
        parts.append('<div class="answer-grid">')
        for q in section.get("questions", []):
            number = q.get("number", "?")
            correct = q.get("correctAnswer") or "—"
            correct_display = str(correct)
            parts.append(
                f'  <div class="answer-item">'
                f'<span class="answer-q">Q{number}</span>'
                f'<span class="answer-v">{html.escape(str(correct_display))}</span>'
                f"</div>"
            )
        parts.append("</div>")

    parts.append("</div>")
    return "\n".join(parts)


def _build_html(data: dict, include_answer_key: bool, section_filter: str | None) -> str:
    title = data.get("title", "SAT Practice Test")
    month = data.get("month", "")
    year = data.get("year", "")
    test_type = data.get("test_type", "")
    total_q = data.get("total_questions", "")
    duration = data.get("duration", "")

    meta_parts = []
    if month and year:
        meta_parts.append(f"{month} {year}")
    if test_type:
        meta_parts.append(test_type)
    if total_q:
        meta_parts.append(f"{total_q} questions")
    if duration:
        meta_parts.append(f"{duration} min")
    meta = "  ·  ".join(meta_parts)

    body_parts: list[str] = []
    for section in data.get("sections", []):
        section_name = section.get("name", "")
        if section_filter and section_filter.lower() not in section_name.lower():
            continue

        body_parts.append(
            f'<div class="section-header">{html.escape(section_name)}</div>'
        )
        # Derive "rw" / "math" from the section name for the classifier
        section_key = "math" if "math" in section_name.lower() else "rw"
        for q in section.get("questions", []):
            body_parts.append(_build_question_html(q, section=section_key))

    answer_key_html = _build_answer_key_html(data) if include_answer_key else ""

    return _HTML_TEMPLATE.format(
        title=html.escape(title),
        meta=html.escape(meta),
        body="\n".join(body_parts),
        answer_key=answer_key_html,
    )


# ---------------------------------------------------------------------------
# PDF generation via Playwright
# ---------------------------------------------------------------------------

_PDF_OPTIONS: dict = {
    "format": "A4",
    "margin": {"top": "20mm", "bottom": "20mm", "left": "18mm", "right": "18mm"},
    "print_background": True,
}


def _render_to_bytes(page: "Page", html_content: str) -> bytes:  # type: ignore[name-defined]
    """
    Render HTML to PDF bytes using an already-open Playwright page.
    Waits for KaTeX auto-render to finish before capturing.
    Re-usable across many exams without re-launching the browser.
    """
    page.set_content(html_content, wait_until="networkidle")
    page.wait_for_function("typeof renderMathInElement !== 'undefined'", timeout=15_000)
    page.wait_for_timeout(1_200)
    return page.pdf(**_PDF_OPTIONS)


def build_pdf_bytes(data: dict, page: "Page") -> bytes:  # type: ignore[name-defined]
    """
    Convert a raw exam dict to PDF bytes using an already-open Playwright page.
    Intended for batch use — caller manages the browser lifecycle.
    """
    html_content = _build_html(data, include_answer_key=True, section_filter=None)
    return _render_to_bytes(page, html_content)


def generate_pdf(
    html_content: str,
    output_path: Path,
) -> None:
    """Standalone single-file PDF export. Opens and closes its own browser."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        pdf_bytes = _render_to_bytes(page, html_content)
        browser.close()

    output_path.write_bytes(pdf_bytes)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a raw SAT JSON file to a PDF with KaTeX-rendered math."
    )
    parser.add_argument("input", help="Path to the raw JSON file (e.g. output/raw/30116.json)")
    parser.add_argument(
        "--output", "-o",
        help="Output PDF path. Defaults to output/pdf/<stem>.pdf",
    )
    parser.add_argument(
        "--no-answer-key",
        action="store_true",
        help="Omit the answer key page at the end",
    )
    parser.add_argument(
        "--section",
        help='Only include sections whose name contains this string (e.g. "Math - Module 1")',
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Default output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_dir = input_path.parent.parent / "pdf"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{input_path.stem}.pdf"

    data = json.loads(input_path.read_text(encoding="utf-8"))
    include_answer_key = not args.no_answer_key

    print(f"Building HTML for: {data.get('title', input_path.stem)}")
    html_content = _build_html(data, include_answer_key, args.section)

    print(f"Rendering PDF via Playwright (KaTeX)…")
    generate_pdf(html_content, output_path)

    print(f"Done → {output_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
json_to_pdf.py — Convert a raw SAT JSON file to a platform-upload-compatible PDF.

The PDF contains selectable text with the exact marker format expected by the
platform parser (see .docs/PDF-TEMPLATE.md):

    **Module 1: Math**

    **Question 1**
    - **Question:** If x + 2 = 5, what is the value of x?
    - **Options:**
    - A) 1
    - B) 2
    - **C) 3**
    - D) 4

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
import sys
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# Module heading normalisation
# ---------------------------------------------------------------------------

_EXACT_HEADINGS = {
    "module 1: reading and writing",
    "module 2: reading and writing",
    "module 1: math",
    "module 2: math",
}


def _normalize_module_heading(section_name: str) -> str:
    """Return the accepted **Module X: Subject** heading for a section name."""
    lower = section_name.lower().strip()
    if lower in _EXACT_HEADINGS:
        # Already in canonical form — just fix capitalisation
        parts = lower.split(":")
        subject = parts[1].strip().title() if len(parts) > 1 else ""
        return f"{parts[0].title()}: {subject}"

    module_num = "2" if "module 2" in lower else "1"
    if "math" in lower:
        subject = "Math"
    elif "reading" in lower or "writing" in lower:
        subject = "Reading and Writing"
    else:
        subject = section_name.strip()

    return f"Module {module_num}: {subject}"


# ---------------------------------------------------------------------------
# Content helpers
# ---------------------------------------------------------------------------

def _strip_tags(raw: str) -> str:
    """Return plain text from an HTML/Markdown fragment."""
    return BeautifulSoup(raw, "html.parser").get_text(separator=" ").strip()


def _question_to_lines(q: dict, number: int, show_answer: bool = True) -> list[str]:
    """Return the parser-format text lines for one question."""
    lines: list[str] = [f"**Question {number}**"]

    passage = _strip_tags(q.get("passage") or "").strip()
    if passage:
        lines.append(f"- **Text:** {passage}")

    content = _strip_tags(q.get("content") or "").strip()
    lines.append(f"- **Question:** {content}")

    options: dict[str, str] = q.get("options") or {}
    correct = (q.get("correctAnswer") or "").strip().upper()
    is_mc = any((options.get(lbl) or "").strip() for lbl in ["A", "B", "C", "D"])

    if is_mc:
        lines.append("- **Options:**")
        for label in ["A", "B", "C", "D"]:
            opt_text = _strip_tags(options.get(label) or "").strip()
            if not opt_text:
                continue
            if show_answer and label == correct:
                lines.append(f"- **{label}) {opt_text}**")
            else:
                lines.append(f"- {label}) {opt_text}")
    else:
        if show_answer:
            answer = (q.get("correctAnswer") or "").strip()
            lines.append(f"- **Answer:** {answer}")

    return lines


# ---------------------------------------------------------------------------
# HTML template — plain text with literal ** markers for PDF text extraction
# ---------------------------------------------------------------------------

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      color: #000;
      padding: 20mm 24mm;
      line-height: 1.7;
    }}
    .cover {{
      text-align: center;
      margin-bottom: 28px;
      padding-bottom: 14px;
      border-bottom: 1.5px solid #333;
    }}
    .cover h1 {{ font-size: 16pt; margin-bottom: 6px; }}
    .cover .meta {{ font-size: 10pt; color: #555; }}
    .module-heading {{
      font-weight: bold;
      font-size: 13pt;
      margin: 30px 0 12px;
    }}
    .q-block {{ margin-bottom: 16px; page-break-inside: avoid; }}
    .q-block p {{ margin: 1px 0; white-space: pre-wrap; }}
  </style>
</head>
<body>

<div class="cover">
  <h1>{title}</h1>
  <div class="meta">{meta}</div>
</div>

{body}

</body>
</html>
"""


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

        module_heading = _normalize_module_heading(section_name)
        body_parts.append(
            f'<p class="module-heading">{html.escape("**" + module_heading + "**")}</p>'
        )

        for i, q in enumerate(section.get("questions", []), 1):
            lines = _question_to_lines(q, i, show_answer=include_answer_key)
            block_html = "\n".join(f"<p>{html.escape(line)}</p>" for line in lines)
            body_parts.append(f'<div class="q-block">{block_html}</div>')

    return _HTML_TEMPLATE.format(
        title=html.escape(title),
        meta=html.escape(meta),
        body="\n".join(body_parts),
    )


# ---------------------------------------------------------------------------
# PDF generation via Playwright
# ---------------------------------------------------------------------------

_PDF_OPTIONS: dict = {
    "format": "A4",
    "margin": {"top": "15mm", "bottom": "15mm", "left": "15mm", "right": "15mm"},
    "print_background": True,
}


def _render_to_bytes(page: "Page", html_content: str) -> bytes:  # type: ignore[name-defined]
    page.set_content(html_content, wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    return page.pdf(**_PDF_OPTIONS)


def build_pdf_bytes(data: dict, page: "Page") -> bytes:  # type: ignore[name-defined]
    """
    Convert a raw exam dict to PDF bytes using an already-open Playwright page.
    Intended for batch use — caller manages the browser lifecycle.
    """
    html_content = _build_html(data, include_answer_key=True, section_filter=None)
    return _render_to_bytes(page, html_content)


def generate_pdf(html_content: str, output_path: Path) -> None:
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
        description="Convert a raw SAT JSON file to a platform-upload-compatible PDF."
    )
    parser.add_argument("input", help="Path to the raw JSON file (e.g. output/raw/30116.json)")
    parser.add_argument(
        "--output", "-o",
        help="Output PDF path. Defaults to output/pdf/<stem>.pdf",
    )
    parser.add_argument(
        "--no-answer-key",
        action="store_true",
        help="Omit correct-answer markers (MC bold + short-answer lines)",
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

    if args.output:
        output_path = Path(args.output)
    else:
        output_dir = input_path.parent.parent / "pdf"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{input_path.stem}.pdf"

    data = json.loads(input_path.read_text(encoding="utf-8"))
    include_answer_key = not args.no_answer_key

    print(f"Building parser-compatible PDF for: {data.get('title', input_path.stem)}")
    html_content = _build_html(data, include_answer_key, args.section)

    print("Rendering PDF via Playwright…")
    generate_pdf(html_content, output_path)

    print(f"Done → {output_path}")


if __name__ == "__main__":
    main()

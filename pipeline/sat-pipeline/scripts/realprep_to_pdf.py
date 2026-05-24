#!/usr/bin/env python3
"""
Convert Real Prep scraped JSON files to SAT-style PDFs.

Layout per question:
    Question
    Options
    Answer (teacher version only)
    Difficulty
    Category

Usage:
    cd pipeline/sat-pipeline
    python3 scripts/realprep_to_pdf.py output/realprep/raw/33113_words_in_context_661_drill_1.json
    python3 scripts/realprep_to_pdf.py --batch
    python3 scripts/realprep_to_pdf.py --batch --student --output-dir output/realprep/pdf_student
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = ROOT_DIR / "output" / "realprep" / "raw"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "output" / "realprep" / "pdf"


_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
          onload="renderMathInElement(document.body, {{
            delimiters: [
              {{left: '$$', right: '$$', display: true}},
              {{left: '$', right: '$', display: false}},
              {{left: '\\\\(', right: '\\\\)', display: false}},
              {{left: '\\\\[', right: '\\\\]', display: true}}
            ],
            throwOnError: false
          }});"></script>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: Georgia, "Times New Roman", serif;
      color: #161616;
      font-size: 11.5pt;
      line-height: 1.42;
      margin: 0 auto;
      padding: 24px 42px;
      max-width: 840px;
    }}
    .cover {{
      border-bottom: 2px solid #111;
      margin-bottom: 26px;
      padding-bottom: 16px;
      text-align: center;
    }}
    .cover h1 {{
      font-size: 20pt;
      margin: 0 0 8px;
    }}
    .meta {{
      color: #555;
      font-size: 10pt;
    }}
    .question {{
      break-inside: auto;
      page-break-inside: auto;
      margin: 0 0 22px;
    }}
    .question-stem {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .block-title {{
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.03em;
      margin: 12px 0 6px;
      text-transform: uppercase;
    }}
    .question-body {{
      border-left: 4px solid #1f2937;
      padding: 7px 12px;
      background: #fafafa;
    }}
    .question-body p {{
      margin: 0 0 8px;
    }}
    .question-body p:last-child {{
      margin-bottom: 0;
    }}
    .question-body .lsqb-passage-content {{
      margin: 0;
    }}
    .question-body .passage-quote {{
      margin-top: 6px;
      padding-left: 26px;
    }}
    .question-prompt {{
      margin-top: 8px;
    }}
    .question-prompt p {{
      margin: 0;
    }}
    .question-body img {{
      max-width: 100%;
      display: block;
      margin: 8px 0;
    }}
    .options {{
      display: flex;
      flex-direction: column;
      gap: 5px;
    }}
    .options .block-title {{
      margin-bottom: 1px;
    }}
    .options.keep-together {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .option-lead {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .option {{
      border: 1.5px solid #c8c8c8;
      border-radius: 8px;
      align-items: flex-start;
      break-inside: avoid;
      display: flex;
      gap: 10px;
      min-height: 0;
      page-break-inside: avoid;
      padding: 6px 10px;
    }}
    .option p {{
      margin: 0;
    }}
    .option.correct {{
      background: #eefbf1;
      border-color: #22c55e;
      font-weight: 700;
    }}
    .option-label {{
      font-weight: 700;
      min-width: 20px;
    }}
    .answer, .meta-row {{
      border: 1px solid #dddddd;
      border-radius: 6px;
      padding: 7px 10px;
      background: #ffffff;
    }}
    .answer strong {{
      font-weight: 800;
    }}
    .divider {{
      border: 0;
      border-top: 1px dashed #cfcfcf;
      margin-top: 18px;
    }}
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


_PDF_OPTIONS = {
    "format": "A4",
    "margin": {"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
    "print_background": True,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Real Prep JSON to PDF.")
    parser.add_argument("input", nargs="?", help="One Real Prep JSON file")
    parser.add_argument("--output", "-o", help="Output PDF path for single-file mode")
    parser.add_argument("--batch", action="store_true", help="Convert all JSON files")
    parser.add_argument(
        "--input-dir",
        default=str(DEFAULT_INPUT_DIR),
        help="Input directory for --batch",
    )
    parser.add_argument(
        "--output-dir",
        help="Output directory for generated PDFs",
    )
    parser.add_argument("--skip-existing", action="store_true", help="Skip existing PDFs")
    parser.add_argument(
        "--student",
        action="store_true",
        help="Hide answers and correct-choice highlighting for student-facing PDFs",
    )
    parser.add_argument(
        "--include-empty",
        action="store_true",
        help="Also render PDFs for quizzes with zero parsed questions",
    )
    args = parser.parse_args()

    input_paths = _resolve_inputs(args)
    output_dir = Path(args.output_dir) if args.output_dir else _default_output_dir(args)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Files: {len(input_paths)}")
    print(f"Output: {output_dir.resolve()}")

    done = 0
    skipped = 0
    errors: list[tuple[Path, str]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        for idx, input_path in enumerate(input_paths, start=1):
            output_path = Path(args.output) if args.output else output_dir / f"{input_path.stem}.pdf"
            label = f"[{idx:3}/{len(input_paths)}] {input_path.name}"

            if args.skip_existing and output_path.exists():
                print(f"{label} skipped")
                skipped += 1
                continue

            try:
                data = json.loads(input_path.read_text(encoding="utf-8"))
                if not args.include_empty and not data.get("questions"):
                    print(f"{label} skipped (no parsed questions)")
                    skipped += 1
                    continue
                pdf_bytes = build_pdf_bytes(data, page, include_answers=not args.student)
                output_path.write_bytes(pdf_bytes)
                print(f"{label} -> {output_path.name}")
                done += 1
            except Exception as exc:
                print(f"{label} ERROR: {exc}", file=sys.stderr)
                errors.append((input_path, str(exc)))

        browser.close()

    print(f"Done: {done} generated, {skipped} skipped, {len(errors)} errors")
    if errors:
        sys.exit(1)


def _resolve_inputs(args: argparse.Namespace) -> list[Path]:
    if args.batch:
        input_dir = Path(args.input_dir)
        if not input_dir.exists():
            print(f"Input directory not found: {input_dir}", file=sys.stderr)
            sys.exit(1)
        return sorted(input_dir.glob("*.json"))

    if not args.input:
        print("Provide an input JSON file or use --batch.", file=sys.stderr)
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    return [input_path]


def _default_output_dir(args: argparse.Namespace) -> Path:
    input_dir = Path(args.input_dir) if args.batch else DEFAULT_INPUT_DIR
    if args.student:
        if input_dir.name == "raw":
            return input_dir.parent / "pdf_student"
        return DEFAULT_OUTPUT_DIR.parent / "pdf_student"
    return DEFAULT_OUTPUT_DIR


def build_pdf_bytes(data: dict, page: Page, include_answers: bool = True) -> bytes:
    html_content = build_html(data, include_answers=include_answers)
    return render_to_bytes(page, html_content)


def build_html(data: dict, include_answers: bool = True) -> str:
    title = data.get("title") or data.get("list_title") or "Real Prep Quiz"
    meta_parts = [
        part
        for part in [
            data.get("section"),
            data.get("course_title"),
            data.get("subject"),
            f"{len(data.get('questions', []))} questions",
        ]
        if part
    ]

    body = "\n".join(
        build_question_html(q, include_answers=include_answers)
        for q in data.get("questions", [])
    )
    return _HTML_TEMPLATE.format(
        title=html.escape(str(title)),
        meta=html.escape(" / ".join(str(part) for part in meta_parts)),
        body=body,
    )


def build_question_html(question: dict, include_answers: bool = True) -> str:
    number = question.get("number", "?")
    question_body_html, question_prompt_html = format_question_fragment(
        question.get("question_html") or question.get("question_text") or ""
    )
    correct_answer = normalize_answer(question.get("correct_answer"))
    difficulty = question.get("difficulty") or "Unknown"
    category = question.get("category") or "Unknown"
    answer_display = correct_answer or "Unknown"
    is_fill_blank = question.get("type") == "cloze_answer"
    choices = question.get("choices", [])
    has_media_choices = any(
        re.search(r"<(?:img|table|svg|canvas)\b", str(choice.get("html") or ""), flags=re.I)
        for choice in choices
    )
    options_class = "options" if has_media_choices else "options keep-together"

    parts = [
        '<div class="question">',
        '<div class="question-stem">',
        f'<div class="block-title">Question {html.escape(str(number))}</div>',
        f'<div class="question-body">{question_body_html}</div>',
    ]
    if question_prompt_html:
        parts.append(f'<div class="question-prompt">{question_prompt_html}</div>')
    parts.extend([
        "</div>",
        f'<div class="{options_class}">',
    ])

    if is_fill_blank:
        parts.append('<div class="option-lead">')
        parts.append('<div class="block-title">Options</div>')
        parts.append('<div class="meta-row">Fill in the blank</div>')
        parts.append("</div>")
    else:
        for idx, choice in enumerate(choices):
            label = str(choice.get("label") or "")
            value = str(choice.get("value") or "")
            is_correct = include_answers and (
                bool(choice.get("is_correct"))
                or (bool(correct_answer) and correct_answer in {label.upper(), value})
            )
            css = " correct" if is_correct else ""
            choice_html = sanitize_fragment(choice.get("html") or choice.get("text") or "")
            if idx == 0:
                parts.append('<div class="option-lead">')
                parts.append('<div class="block-title">Options</div>')
            parts.append(
                f'<div class="option{css}">'
                f'<span class="option-label">{html.escape(label)}</span>'
                f"<span>{choice_html}</span>"
                "</div>"
            )
            if idx == 0:
                parts.append("</div>")

    parts.append("</div>")

    if include_answers:
        parts.extend(
            [
            '<div class="block-title">Answer</div>',
            f'<div class="answer"><strong>{html.escape(answer_display)}</strong></div>',
            ]
        )

    if include_answers:
        parts.extend(
            [
                '<div class="block-title">Difficulty</div>',
                f'<div class="meta-row">{html.escape(str(difficulty))}</div>',
                '<div class="block-title">Category</div>',
                f'<div class="meta-row">{html.escape(str(category))}</div>',
            ]
        )

    parts.extend(['<hr class="divider" />', "</div>"])
    return "\n".join(parts)


def normalize_answer(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item).strip().upper() for item in value if str(item).strip())
    answer = str(value).strip()
    if not answer:
        return ""
    return answer.upper() if len(answer) == 1 else answer


def format_question_fragment(value: str) -> tuple[str, str]:
    value = html.unescape(str(value)).strip()
    split_pattern = r"<hr\b[^>]*class=[\"'][^\"']*\blsqb-split\b[^\"']*[\"'][^>]*>\s*"
    value = re.sub(
        r"<p\b[^>]*style=[\"'][^\"']*padding-left\s*:\s*40px;?[^\"']*[\"'][^>]*>",
        '<p class="passage-quote">',
        value,
        flags=re.I,
    )
    if re.search(split_pattern, value, flags=re.I):
        body, prompt = re.split(split_pattern, value, maxsplit=1, flags=re.I)
        return sanitize_fragment(body), sanitize_fragment(prompt)
    return sanitize_fragment(value), ""


def sanitize_fragment(value: str) -> str:
    value = html.unescape(str(value)).strip()
    if not value:
        return ""
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(r"</br\\s*>", "", value, flags=re.I)
    if not re.search(r"</?[a-zA-Z][^>]*>", value):
        return f"<p>{html.escape(value)}</p>"
    return value


def render_to_bytes(page: Page, html_content: str) -> bytes:
    page.set_content(html_content, wait_until="networkidle")
    page.wait_for_function("typeof renderMathInElement !== 'undefined'", timeout=15_000)
    page.wait_for_timeout(800)
    return page.pdf(**_PDF_OPTIONS)


if __name__ == "__main__":
    main()

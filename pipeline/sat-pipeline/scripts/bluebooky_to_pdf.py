#!/usr/bin/env python3
"""
bluebooky_to_pdf.py — Convert a bluebooky raw JSON file to a platform-upload-compatible PDF.

The PDF contains selectable text with the exact marker format expected by the
platform parser (see .docs/PDF-TEMPLATE.md):

    **Module 1: Reading and Writing**

    **Question 1**
    - **Text:** passage text...
    - **Question:** Which choice completes the text?
    - **Options:**
    - **A) contributions to**
    - B) doubts about
    - C) imitations of
    - D) misunderstandings of

Handles all question types:
  - mcq     → A/B/C/D options; correct option wrapped in **...**
  - grid_in → short-answer format with - **Answer:** line

viz_data (tables, charts) is omitted from the upload PDF — the platform
parser does not support embedded visuals.

Usage:
    cd pipeline/sat-pipeline
    python3 scripts/bluebooky_to_pdf.py output/bluebooky/raw/2024-03-01_rw.json
    python3 scripts/bluebooky_to_pdf.py output/bluebooky/raw/2024-03-01_rw.json -o ~/Desktop/out.pdf
    python3 scripts/bluebooky_to_pdf.py --all
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# Section / module heading
# ---------------------------------------------------------------------------

_SECTION_TO_SUBJECT = {
    "rw": "Reading and Writing",
    "math": "Math",
}

_OPTION_LABELS = ["A", "B", "C", "D"]


def _section_to_module_heading(section: str, module_num: int = 1) -> str:
    """Return the accepted **Module X: Subject** heading string (without **)."""
    subject = _SECTION_TO_SUBJECT.get(section.lower(), section.upper())
    return f"Module {module_num}: {subject}"


# ---------------------------------------------------------------------------
# Watermark removal
# ---------------------------------------------------------------------------

_WATERMARK_RE = re.compile(r"\*\*\[bluebooky\.com\]\*\*", re.IGNORECASE)


def _clean(text: str) -> str:
    return _WATERMARK_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Markdown → plain text
# Bluebooky stores passage/prompt as Markdown. Strip formatting for the
# parser-compatible text layer; we want clean plain text inside the markers.
# ---------------------------------------------------------------------------

def _md_to_text(text: str | None) -> str:
    """Strip Markdown formatting, returning plain text suitable for the parser."""
    if not text:
        return ""
    t = _clean(text)
    # Remove bold/italic markers
    t = re.sub(r'\*\*(.+?)\*\*', r'\1', t, flags=re.DOTALL)
    t = re.sub(r'\*(.+?)\*',     r'\1', t, flags=re.DOTALL)
    t = re.sub(r'__(.+?)__',     r'\1', t, flags=re.DOTALL)
    # Blockquote marker
    t = re.sub(r'^> ?', '', t, flags=re.MULTILINE)
    # Collapse multiple blank lines
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


# ---------------------------------------------------------------------------
# Correct-answer extraction
# ---------------------------------------------------------------------------

def _correct_label(q: dict) -> str | None:
    """Return the correct option label (A/B/C/D) or None if unknown."""
    for key in ("correct_index", "correctIndex", "answer_index"):
        ci = q.get(key)
        if ci is not None:
            try:
                return _OPTION_LABELS[int(ci)]
            except (IndexError, ValueError, TypeError):
                pass
    for key in ("correct_answer", "correctAnswer", "answer"):
        ca = q.get(key)
        if ca and isinstance(ca, str) and ca.strip().upper() in _OPTION_LABELS:
            return ca.strip().upper()
    return None


def _correct_text_answer(q: dict) -> str:
    """Return the correct text for short-answer questions."""
    for key in ("correct_answer", "correctAnswer", "answer"):
        v = q.get(key)
        if v and isinstance(v, str):
            return v.strip()
    return ""


# ---------------------------------------------------------------------------
# Question → parser-format text lines
# ---------------------------------------------------------------------------

def _question_to_lines(q: dict, global_number: int) -> list[str]:
    prompt   = _md_to_text(q.get("prompt") or "")
    passage  = _md_to_text(q.get("passage") or "")
    q_type   = q.get("q_type") or "mcq"
    options  = q.get("options") or []
    is_mc    = q_type == "mcq" and len(options) > 0

    lines: list[str] = [f"**Question {global_number}**"]

    if passage:
        # Single-line passage for the marker; collapse newlines
        passage_line = " ".join(passage.split())
        lines.append(f"- **Text:** {passage_line}")

    if prompt:
        prompt_line = " ".join(prompt.split())
        lines.append(f"- **Question:** {prompt_line}")

    if is_mc:
        correct = _correct_label(q)
        lines.append("- **Options:**")
        for i, opt in enumerate(options[:4]):
            label    = _OPTION_LABELS[i]
            opt_text = _md_to_text(opt.get("text") or "").replace("\n", " ").strip()
            if label == correct:
                lines.append(f"- **{label}) {opt_text}**")
            else:
                lines.append(f"- {label}) {opt_text}")
    else:
        answer = _correct_text_answer(q)
        lines.append(f"- **Answer:** {answer}")

    return lines


# ---------------------------------------------------------------------------
# HTML template
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

_PDF_OPTIONS: dict = {
    "format": "A4",
    "margin": {"top": "15mm", "bottom": "15mm", "left": "15mm", "right": "15mm"},
    "print_background": True,
}


def _build_html(data: dict) -> str:
    test_date = data.get("test_date", "")
    section   = data.get("section", "")
    q_count   = data.get("question_count", len(data.get("questions", [])))
    module_num = int(data.get("module", 1))

    subject_label = _SECTION_TO_SUBJECT.get(section.lower(), section.upper())
    title         = f"{test_date}  ·  {subject_label}"
    meta          = f"{q_count} questions"
    module_heading = _section_to_module_heading(section, module_num)

    body_parts: list[str] = [
        f'<p class="module-heading">{html.escape("**" + module_heading + "**")}</p>',
    ]

    for idx, q in enumerate(data.get("questions", []), 1):
        lines     = _question_to_lines(q, idx)
        block_html = "\n".join(f"<p>{html.escape(line)}</p>" for line in lines)
        body_parts.append(f'<div class="q-block">{block_html}</div>')

    return _HTML_TEMPLATE.format(
        title=html.escape(title),
        meta=html.escape(meta),
        body="\n".join(body_parts),
    )


def _render(page: "Page", html_content: str) -> bytes:  # type: ignore[name-defined]
    page.set_content(html_content, wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    return page.pdf(**_PDF_OPTIONS)


def render_file(input_path: Path, output_path: Path, page: "Page") -> int:  # type: ignore[name-defined]
    """Render one JSON file to PDF. Returns number of questions rendered."""
    data      = json.loads(input_path.read_text(encoding="utf-8"))
    html_str  = _build_html(data)
    pdf       = _render(page, html_str)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pdf)
    return len(data.get("questions", []))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a bluebooky raw JSON file (or all files) to a platform-upload-compatible PDF."
    )
    parser.add_argument(
        "input", nargs="?",
        help="Path to a single bluebooky JSON file (omit with --all)"
    )
    parser.add_argument("-o", "--output", help="Output PDF path (single-file mode only)")
    parser.add_argument(
        "--all", action="store_true",
        help="Render all JSON files in output/bluebooky/raw/ → output/bluebooky/pdf/"
    )
    args = parser.parse_args()

    if not args.input and not args.all:
        parser.print_help()
        sys.exit(1)

    raw_dir = Path(__file__).parent.parent / "output" / "bluebooky" / "raw"
    pdf_dir = Path(__file__).parent.parent / "output" / "bluebooky" / "pdf"

    if args.all:
        files = sorted(raw_dir.glob("*.json"))
        if not files:
            print(f"No JSON files found in {raw_dir}", file=sys.stderr)
            sys.exit(1)
        jobs = [(f, pdf_dir / f.with_suffix(".pdf").name) for f in files]
    else:
        inp = Path(args.input)
        out = Path(args.output) if args.output else pdf_dir / inp.with_suffix(".pdf").name
        jobs = [(inp, out)]

    total_q = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page    = browser.new_page()

        for idx, (inp, out) in enumerate(jobs, 1):
            label = f"[{idx:2}/{len(jobs)}] {inp.name}"
            print(f"{label:<55} … ", end="", flush=True)
            try:
                n = render_file(inp, out, page)
                size_kb = out.stat().st_size // 1024
                print(f"OK  {n} questions  ({size_kb} KB)")
                total_q += n
            except Exception as e:
                print(f"FAILED: {e}", file=sys.stderr)

        browser.close()

    print(f"\n✓  {len(jobs)} files  |  {total_q} questions  →  {pdf_dir if args.all else jobs[0][1]}")


if __name__ == "__main__":
    main()

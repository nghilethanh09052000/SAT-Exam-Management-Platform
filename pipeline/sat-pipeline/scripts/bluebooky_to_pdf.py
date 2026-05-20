#!/usr/bin/env python3
"""
bluebooky_to_pdf.py — Convert a bluebooky raw JSON file to a PDF.

Handles all question types:
  - mcq       → A/B/C/D option bubbles (options are [{text: ...}])
  - grid_in   → student-produced response box

Handles all viz_data types:
  - table     → HTML <table> with title + headers + rows
  - bar       → grouped bar chart via Chart.js
  - line      → multi-line chart via Chart.js

Math (KaTeX) is rendered the same as json_to_pdf.py.

Usage
-----
    cd pipeline/sat-pipeline
    python3 scripts/bluebooky_to_pdf.py output/bluebooky/raw/2024-03-01_rw.json
    python3 scripts/bluebooky_to_pdf.py output/bluebooky/raw/2024-03-01_rw.json -o ~/Desktop/out.pdf

Batch (all tests):
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

from utils.classifier import classify_question

# ---------------------------------------------------------------------------
# Watermark removal
# Bluebooky embeds "**[bluebooky.com]**" in chart titles and axis labels.
# ---------------------------------------------------------------------------
_WATERMARK_RE = re.compile(r"\*\*\[bluebooky\.com\]\*\*", re.IGNORECASE)

# {viz} is a placeholder bluebooky inserts in passage text to mark where the
# chart/table should appear inline.  We render viz_data separately, so we
# strip the placeholder before passing text to the Markdown converter.
_VIZ_PLACEHOLDER_RE = re.compile(r'\{viz\}\s*', re.IGNORECASE)


def _clean_label(text: str) -> str:
    return _WATERMARK_RE.sub("", text).strip()


def _clean_lines(lines: list[str]) -> list[str]:
    return [_clean_label(l) for l in lines if _clean_label(l)]


def _cell(value: object) -> str:
    """Escape a table cell value and convert embedded newlines to <br>."""
    return html.escape(str(value)).replace('\n', '<br>')


# ---------------------------------------------------------------------------
# viz_data → HTML snippet
# ---------------------------------------------------------------------------

_CHART_COLORS = [
    "rgba(37,99,235,0.85)",    # blue
    "rgba(220,38,38,0.85)",    # red
    "rgba(22,163,74,0.85)",    # green
    "rgba(234,179,8,0.85)",    # yellow
    "rgba(168,85,247,0.85)",   # purple
    "rgba(249,115,22,0.85)",   # orange
]
_CHART_BORDER = [c.replace("0.85", "1") for c in _CHART_COLORS]

_CHART_ID = 0


def _next_chart_id() -> str:
    global _CHART_ID
    _CHART_ID += 1
    return f"chart_{_CHART_ID}"


def _render_table(vd: dict) -> str:
    raw_title = vd.get("title") or ""
    # title can be a string OR a list of lines (same as titleLines on charts)
    if isinstance(raw_title, list):
        raw_title = " ".join(_clean_lines(raw_title))
    title = html.escape(_clean_label(str(raw_title)))
    headers = vd.get("headers") or []
    rows    = vd.get("rows") or []

    th_cells = "".join(f"<th>{_cell(h)}</th>" for h in headers)
    tbody = ""
    for row in rows:
        cells = "".join(f"<td>{_cell(c)}</td>" for c in row)
        tbody += f"<tr>{cells}</tr>"

    return f"""
<div class="viz-table">
  {'<div class="viz-title">' + title + '</div>' if title else ''}
  <table>
    <thead><tr>{th_cells}</tr></thead>
    <tbody>{tbody}</tbody>
  </table>
</div>
"""


def _render_bar(vd: dict) -> str:
    cid        = _next_chart_id()
    data       = vd.get("data") or []
    legend     = vd.get("legend") or []
    title      = " ".join(_clean_lines(vd.get("titleLines") or []))
    x_label    = " ".join(_clean_lines(vd.get("xAxisLines") or []))
    y_label    = " ".join(_clean_lines(vd.get("yAxisLines") or []))
    y_min      = vd.get("yMin", 0)
    y_max      = vd.get("yMax")
    y_step     = vd.get("yTickStep")

    x_labels_js  = json.dumps([d.get("label", "") for d in data])

    # Each item in legend is a separate dataset; each data point has values[i]
    n_series = len(legend) if legend else (max((len(d.get("values", [])) for d in data), default=1))
    datasets = []
    for s_idx in range(n_series):
        s_label  = legend[s_idx] if s_idx < len(legend) else f"Series {s_idx+1}"
        values   = [d.get("values", [])[s_idx] if s_idx < len(d.get("values", [])) else 0 for d in data]
        color    = _CHART_COLORS[s_idx % len(_CHART_COLORS)]
        border   = _CHART_BORDER[s_idx % len(_CHART_BORDER)]
        datasets.append(
            f'{{"label":{json.dumps(s_label)},"data":{json.dumps(values)},'
            f'"backgroundColor":"{color}","borderColor":"{border}","borderWidth":1}}'
        )

    datasets_js = "[" + ",".join(datasets) + "]"

    y_scale = "{"
    if y_min is not None:
        y_scale += f'"min":{y_min},'
    if y_max is not None:
        y_scale += f'"max":{y_max},'
    if y_step is not None:
        y_scale += f'"ticks":{{"stepSize":{y_step}}},'
    y_scale += f'"title":{{"display":{json.dumps(bool(y_label))},"text":{json.dumps(y_label)}}}}}'

    x_scale = f'{{"title":{{"display":{json.dumps(bool(x_label))},"text":{json.dumps(x_label)}}}}}'

    title_js = json.dumps(title)

    return f"""
<div class="viz-chart">
  <canvas id="{cid}" width="520" height="300"></canvas>
  <script>
    new Chart(document.getElementById({json.dumps(cid)}), {{
      type: 'bar',
      data: {{ labels: {x_labels_js}, datasets: {datasets_js} }},
      options: {{
        responsive: false,
        plugins: {{
          title: {{ display: {json.dumps(bool(title))}, text: {title_js}, font: {{size: 12}} }},
          legend: {{ display: {json.dumps(n_series > 1)} }}
        }},
        scales: {{ y: {y_scale}, x: {x_scale} }}
      }}
    }});
  </script>
</div>
"""


def _render_line(vd: dict) -> str:
    cid        = _next_chart_id()
    data       = vd.get("data") or []
    legend     = vd.get("legend") or []
    title      = " ".join(_clean_lines(vd.get("titleLines") or []))
    x_label    = " ".join(_clean_lines(vd.get("xAxisLines") or []))
    y_label    = " ".join(_clean_lines(vd.get("yAxisLines") or []))
    x_ticks    = vd.get("xTickLabels") or [str(i) for i in range(max((len(d.get("values", [])) for d in data), default=1))]
    y_max      = vd.get("yMax")
    y_step     = vd.get("yTickStep")

    datasets = []
    for s_idx, series in enumerate(data):
        s_label = legend[s_idx] if s_idx < len(legend) else series.get("label", f"Series {s_idx+1}")
        values  = series.get("values") or []
        color   = _CHART_BORDER[s_idx % len(_CHART_BORDER)]
        datasets.append(
            f'{{"label":{json.dumps(s_label)},"data":{json.dumps(values)},'
            f'"borderColor":"{color}","backgroundColor":"{color.replace("1)", "0.1)")}","tension":0.3,"fill":false,"pointRadius":4}}'
        )

    datasets_js  = "[" + ",".join(datasets) + "]"
    x_labels_js  = json.dumps(x_ticks)

    y_scale = "{"
    if y_max is not None:
        y_scale += f'"min":0,"max":{y_max},'
    if y_step is not None:
        y_scale += f'"ticks":{{"stepSize":{y_step}}},'
    y_scale += f'"title":{{"display":{json.dumps(bool(y_label))},"text":{json.dumps(y_label)}}}}}'

    x_scale = f'{{"title":{{"display":{json.dumps(bool(x_label))},"text":{json.dumps(x_label)}}}}}'

    title_js = json.dumps(title)

    return f"""
<div class="viz-chart">
  <canvas id="{cid}" width="520" height="300"></canvas>
  <script>
    new Chart(document.getElementById({json.dumps(cid)}), {{
      type: 'line',
      data: {{ labels: {x_labels_js}, datasets: {datasets_js} }},
      options: {{
        responsive: false,
        plugins: {{
          title: {{ display: {json.dumps(bool(title))}, text: {title_js}, font: {{size: 12}} }},
          legend: {{ display: true }}
        }},
        scales: {{ y: {y_scale}, x: {x_scale} }}
      }}
    }});
  </script>
</div>
"""


def _render_viz(vd: dict | None) -> str:
    if not vd or not isinstance(vd, dict):
        return ""
    t = vd.get("type")
    if t == "table":
        return _render_table(vd)
    if t == "bar":
        return _render_bar(vd)
    if t == "line":
        return _render_line(vd)
    # Unknown type — dump as preformatted JSON so nothing is lost
    return f'<pre class="viz-unknown">{html.escape(json.dumps(vd, indent=2))}</pre>'


# ---------------------------------------------------------------------------
# Markdown → HTML
# Bluebooky stores passage/prompt as a subset of Markdown (not HTML).
# Patterns: \n\n (paragraph), \n (line break), > (blockquote),
#           **bold**, *italic*, __underline__
# ---------------------------------------------------------------------------

def _md_to_html(text: str | None) -> str:
    """Convert bluebooky Markdown subset to HTML."""
    if not text:
        return ""

    # Bluebooky stores newlines as the literal two-character sequence \n
    # (double-escaped in JSON → backslash + n after json.load).
    # Convert to real newlines so all subsequent regex/split logic works.
    text = text.replace('\\n', '\n')

    # Dual-passage labels arrive as "**Text 1**\n<body>" (single newline).
    # Promote to double-newline so the block splitter isolates the label.
    text = re.sub(r'(\*\*Text \d+\*\*)\n(?!\n)', r'\1\n\n', text)

    # Inline formatting helper (applied inside each block)
    def _inline(t: str) -> str:
        # Order matters: ** before *
        t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t, flags=re.DOTALL)
        t = re.sub(r'\*(.+?)\*',     r'<em>\1</em>',         t, flags=re.DOTALL)
        t = re.sub(r'__(.+?)__',     r'<u>\1</u>',           t, flags=re.DOTALL)
        # Single newline within a block → <br>
        t = t.replace('\n', '<br>')
        return t

    html_parts: list[str] = []
    # Split into blocks on double newline
    for block in re.split(r'\n{2,}', text.strip()):
        block = block.strip()
        if not block:
            continue
        if block.startswith('> '):
            # Blockquote — strip leading "> " from each line
            inner = '\n'.join(
                line[2:] if line.startswith('> ') else line
                for line in block.splitlines()
            )
            html_parts.append(f'<blockquote>{_inline(inner)}</blockquote>')
        elif re.match(r'^\*\*Text \d+\*\*$', block):
            # Dual-passage label — render as a styled heading
            label = re.sub(r'\*\*(.+?)\*\*', r'\1', block)
            html_parts.append(f'<p class="text-label">{html.escape(label)}</p>')
        else:
            html_parts.append(f'<p>{_inline(block)}</p>')

    return '\n'.join(html_parts)


# ---------------------------------------------------------------------------
# Question → HTML block
# ---------------------------------------------------------------------------

_OPTION_LABELS = ["A", "B", "C", "D"]


def _sanitize(raw: str | None) -> str:
    """Convert passage/prompt: strip {viz} placeholder, then Markdown → HTML."""
    raw = (raw or "").strip()
    if not raw:
        return ""
    # Remove {viz} placeholder — viz_data is rendered separately in the layout
    raw = _VIZ_PLACEHOLDER_RE.sub("", raw).strip()
    if not raw:
        return ""
    # If it already looks like HTML, pass through; otherwise treat as Markdown
    if raw.startswith("<"):
        return raw
    return _md_to_html(raw)


def _question_html(q: dict, global_number: int, section: str = "rw") -> str:
    prompt   = _sanitize(q.get("prompt") or "")
    passage  = _sanitize(q.get("passage") or "")
    q_type   = q.get("q_type") or "mcq"
    options  = q.get("options") or []
    vd       = q.get("viz_data")

    # MC: options are [{text: "..."}]; use A/B/C/D labels
    is_mc    = q_type == "mcq" and len(options) > 0
    viz_html = _render_viz(vd)

    raw_section: str = section if section in ("rw", "math") else "rw"
    category = classify_question(
        text=prompt,
        section=raw_section,  # type: ignore[arg-type]
        domain=q.get("domain"),
    )
    category_html = f'<span class="category-badge">{html.escape(category)}</span>'

    parts = [
        f'<div class="question">',
        f'  <div class="question-header">',
        f'    <span class="question-number">{global_number}</span>',
        f'    {category_html}',
        f'  </div>',
    ]

    if passage:
        parts.append(f'  <div class="passage">{passage}</div>')

    if viz_html:
        parts.append(f'  <div class="viz-wrap">{viz_html}</div>')

    if prompt:
        parts.append(f'  <div class="question-content">{prompt}</div>')

    if is_mc:
        parts.append('  <div class="options">')
        for i, opt in enumerate(options[:4]):
            label   = _OPTION_LABELS[i]
            opt_txt = _sanitize(opt.get("text") or "")
            parts.append(
                f'    <div class="option">'
                f'<span class="option-label">{label}</span>'
                f'<span>{opt_txt}</span>'
                f"</div>"
            )
        parts.append("  </div>")
    else:
        parts.append('  <div class="spr-box">Student-produced response</div>')

    parts += ["</div>", '<hr class="divider" />']
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Full HTML page
# ---------------------------------------------------------------------------

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>

  <!-- KaTeX -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer
    src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body,{{
      delimiters:[
        {{left:'$$',right:'$$',display:true}},
        {{left:'$',right:'$',display:false}}
      ],throwOnError:false
    }});"></script>

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>

  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:Georgia,serif;font-size:12.5pt;color:#1a1a1a;
          padding:24px 46px;max-width:820px;margin:0 auto;line-height:1.55}}

    /* Cover */
    .cover{{text-align:center;margin-bottom:32px;padding-bottom:18px;
             border-bottom:2px solid #1a1a1a}}
    .cover h1{{font-size:18pt;margin-bottom:5px}}
    .cover .meta{{font-size:10pt;color:#666}}

    /* Question */
    .question{{margin-bottom:30px;page-break-inside:avoid}}
    .question-header{{display:flex;align-items:center;gap:12px;margin-bottom:10px}}
    .question-number{{font-weight:bold;font-size:10pt;background:#1a1a1a;color:#fff;
                       min-width:26px;height:26px;display:inline-flex;
                       align-items:center;justify-content:center;border-radius:50%;flex-shrink:0}}
    .category-badge{{font-size:8.5pt;font-weight:600;color:#2563eb;
                      background:#eff6ff;border:1px solid #bfdbfe;
                      border-radius:12px;padding:2px 9px;white-space:nowrap}}
    .passage{{margin:0 0 12px 38px;padding:10px 14px;background:#f8f8f8;
               border-left:3px solid #bbb;font-size:11pt;line-height:1.6}}
    .passage p{{margin-bottom:5px}}
    .passage blockquote{{margin:8px 0 8px 16px;padding:6px 12px;
                          border-left:3px solid #888;color:#333;font-style:italic}}
    .passage .text-label{{font-weight:bold;font-size:10.5pt;margin:10px 0 4px;
                           border-bottom:1px solid #ccc;padding-bottom:2px}}
    .question-content{{margin:0 0 12px 38px;line-height:1.6}}
    .question-content p{{margin-bottom:5px}}

    /* viz */
    .viz-wrap{{margin:0 0 14px 38px}}
    .viz-title{{font-weight:bold;font-size:11pt;text-align:center;margin-bottom:6px}}
    .viz-chart{{display:inline-block}}
    .viz-table table{{border-collapse:collapse;font-size:10pt;width:100%}}
    .viz-table th{{background:#f0f0f0;border:1px solid #ccc;padding:5px 8px;text-align:left}}
    .viz-table td{{border:1px solid #ddd;padding:4px 8px}}
    .viz-unknown{{font-size:8pt;background:#fafafa;border:1px solid #ddd;
                   padding:8px;border-radius:4px;white-space:pre-wrap}}

    /* Options */
    .options{{margin-left:38px;display:flex;flex-direction:column;gap:6px}}
    .option{{display:flex;align-items:baseline;gap:10px;padding:6px 10px;
              border:1.5px solid #d0d0d0;border-radius:20px}}
    .option-label{{font-weight:bold;font-size:10pt;min-width:18px;color:#333}}
    .spr-box{{margin-left:38px;margin-top:10px;display:inline-block;
               min-width:120px;min-height:34px;border:1.5px solid #bbb;
               border-radius:6px;padding:6px 12px;font-size:10pt;
               color:#999;font-style:italic}}
    .divider{{border:none;border-top:1px dashed #ccc;margin:22px 0 0}}
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


def _build_html(data: dict) -> str:
    global _CHART_ID
    _CHART_ID = 0  # reset per file

    test_date = data.get("test_date", "")
    section   = data.get("section", "")
    q_count   = data.get("question_count", len(data.get("questions", [])))

    section_label = {"rw": "Reading & Writing", "math": "Math"}.get(section, section.upper())
    title = f"{test_date}  ·  {section_label}"
    meta  = f"{q_count} questions"

    body_parts: list[str] = []
    for idx, q in enumerate(data.get("questions", []), 1):
        body_parts.append(_question_html(q, idx, section))

    return _HTML_TEMPLATE.format(
        title=html.escape(title),
        meta=html.escape(meta),
        body="\n".join(body_parts),
    )


# ---------------------------------------------------------------------------
# Playwright render
# ---------------------------------------------------------------------------

_PDF_OPTIONS: dict = {
    "format": "A4",
    "margin": {"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
    "print_background": True,
}


def _render(page: "Page", html_content: str) -> bytes:  # type: ignore[name-defined]
    page.set_content(html_content, wait_until="networkidle")
    # Wait for KaTeX + Chart.js to finish rendering
    page.wait_for_function("typeof Chart !== 'undefined'", timeout=15_000)
    page.wait_for_timeout(1_800)
    return page.pdf(**_PDF_OPTIONS)


def render_file(input_path: Path, output_path: Path, page: "Page") -> int:  # type: ignore[name-defined]
    """Render one JSON file to PDF. Returns number of questions rendered."""
    data     = json.loads(input_path.read_text(encoding="utf-8"))
    html_str = _build_html(data)
    pdf      = _render(page, html_str)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pdf)
    return len(data.get("questions", []))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a bluebooky raw JSON file (or all files) to PDF."
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

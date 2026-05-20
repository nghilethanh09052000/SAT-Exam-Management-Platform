#!/usr/bin/env python3
"""
batch_to_pdf.py — Convert all raw SAT JSON files to PDF in one pass.

Reuses a single Playwright browser instance across all files so the
KaTeX CDN is only fetched once and each file renders much faster.

Usage
-----
    cd pipeline/sat-pipeline

    # Convert everything in output/raw/ → output/pdf/
    PYTHONPATH=. python3 scripts/batch_to_pdf.py

    # Custom input/output directories
    PYTHONPATH=. python3 scripts/batch_to_pdf.py --input output/satgpt/raw --output output/satgpt/pdf

    # Skip files that already have a PDF (useful for incremental re-runs)
    PYTHONPATH=. python3 scripts/batch_to_pdf.py --skip-existing

    # Only re-convert specific files
    PYTHONPATH=. python3 scripts/batch_to_pdf.py --ids 1 30116 30117
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# Allow running from the project root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.json_to_pdf import _build_html, _render_to_bytes  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch-convert SAT JSON files to PDF."
    )
    parser.add_argument(
        "--input", "-i",
        default="output/raw",
        help="Directory containing raw JSON files (default: output/raw)",
    )
    parser.add_argument(
        "--output", "-o",
        default="output/pdf",
        help="Directory to write PDF files to (default: output/pdf)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip files that already have a PDF in the output directory",
    )
    parser.add_argument(
        "--ids",
        nargs="+",
        help="Only convert files whose stem matches one of these IDs (e.g. --ids 1 30116)",
    )
    args = parser.parse_args()

    input_dir  = Path(args.input)
    output_dir = Path(args.output)

    if not input_dir.exists():
        print(f"ERROR: input directory not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(input_dir.glob("*.json"))
    if not files:
        print(f"No JSON files found in {input_dir}")
        sys.exit(0)

    # Filter by explicit IDs if requested
    if args.ids:
        id_set = set(args.ids)
        files = [f for f in files if f.stem in id_set]
        if not files:
            print(f"No files matched IDs: {args.ids}", file=sys.stderr)
            sys.exit(1)

    total   = len(files)
    done    = 0
    skipped = 0
    errors: list[tuple[str, str]] = []

    print(f"Input  : {input_dir.resolve()}")
    print(f"Output : {output_dir.resolve()}")
    print(f"Files  : {total}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page    = browser.new_page()

        for i, jf in enumerate(files, 1):
            out   = output_dir / f"{jf.stem}.pdf"
            label = f"[{i:3}/{total}] {jf.name:<30}"

            if args.skip_existing and out.exists():
                print(f"{label}  skipped (exists)")
                skipped += 1
                continue

            try:
                data         = json.loads(jf.read_text(encoding="utf-8"))
                html_content = _build_html(data, include_answer_key=True, section_filter=None)
                pdf_bytes    = _render_to_bytes(page, html_content)
                out.write_bytes(pdf_bytes)
                title = data.get("title", "")
                print(f"{label}  → {out.name}  ({title})")
                done += 1
            except Exception as exc:
                print(f"{label}  ERROR: {exc}", file=sys.stderr)
                errors.append((jf.name, str(exc)))

        browser.close()

    print()
    print("─" * 60)
    print(f"✓  {done} PDFs generated  |  {skipped} skipped  |  {len(errors)} errors")
    if errors:
        print("\nFailed files:")
        for name, err in errors:
            print(f"  {name}: {err}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

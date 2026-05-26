#!/usr/bin/env python3
"""Convert a SAT Suite Question Bank PDF into mapped-format import PDF.

The output is a text PDF containing blocks such as:

00000_Question_1(002dba45)_Math
00001_
00002_...
00003_...
==End==

For multiple-choice questions, the correct option is marked with T (True).
For student-produced responses, accepted answers are written in 00003_.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import WrapMode, XPos, YPos


DEFAULT_PDF = Path.home() / "Downloads" / "SAT Suite Question Bank - Math - Medium - With.pdf"
DEFAULT_OUT_PDF = Path.home() / "Downloads" / "SAT Suite Question Bank - Math - Medium - With.import.pdf"
DEFAULT_OUT_TXT = Path.home() / "Downloads" / "SAT Suite Question Bank - Math - Medium - With.import.txt"
HELPER_PATH = Path(__file__).with_name("convert_sat_question_bank_pdf_to_mapped_docx.py")
FONT_PATHS = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
]


def load_helper():
    spec = importlib.util.spec_from_file_location("sat_mapped_docx_helper", HELPER_PATH)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load helper script: {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def require_tool(name: str) -> None:
    if not shutil.which(name):
        raise SystemExit(f"Missing required command: {name}. Install poppler, for example: brew install poppler")


def page_count(pdf_path: Path) -> int:
    completed = subprocess.run(["pdfinfo", str(pdf_path)], check=True, text=True, capture_output=True)
    match = re.search(r"^Pages:\s+(\d+)\s*$", completed.stdout, re.M)
    if not match:
        raise RuntimeError("Could not determine PDF page count from pdfinfo")
    return int(match.group(1))


def clean_line(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = normalize_math_letters(value)
    value = (
        value.replace("\ufeff", "")
        .replace("\u00a0", " ")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .replace("\u2044", "/")
        .replace("\u2062", "")
        .replace("\ufe00", "")
    )
    return re.sub(r"\s+", " ", value).strip()


def normalize_math_letters(value: str) -> str:
    out: list[str] = []
    for char in value:
        name = unicodedata.name(char, "")
        match = re.match(r"MATHEMATICAL [A-Z ]+ (SMALL|CAPITAL) ([A-Z])$", name)
        if match:
            letter = match.group(2)
            out.append(letter.lower() if match.group(1) == "SMALL" else letter)
        else:
            out.append(char)
    return "".join(out)


def sanitize_category(value: str | None) -> str:
    cleaned = clean_line(value or "Math")
    cleaned = re.sub(r"[()_]", " ", cleaned)
    return clean_line(cleaned) or "Math"


def extract_category(page_text: str) -> str:
    lines = [clean_line(line) for line in page_text.splitlines() if clean_line(line)]
    for idx, line in enumerate(lines):
        if line.startswith("SAT Math "):
            tail = clean_line(line.removeprefix("SAT Math "))
            if tail:
                return sanitize_category(tail)
        if line == "Skill" and idx + 1 < len(lines):
            return sanitize_category(lines[idx + 1])
        if " Algebra " in f" {line} ":
            return "Algebra"
        if "Advanced Math" in line:
            return "Advanced Math"
        if "Problem-Solving and Data Analysis" in line:
            return "Problem Solving and Data Analysis"
        if "Geometry and Trigonometry" in line:
            return "Geometry and Trigonometry"
    return "Math"


def extract_question_body(question_text: str, qid: str) -> str:
    lines = [clean_line(line) for line in question_text.splitlines()]
    body: list[str] = []
    seen_question_id = False

    for line in lines:
        if not line:
            continue
        if re.match(r"^Question ID\b", line):
            continue
        if re.search(rf"\bID:\s*{re.escape(qid)}\b$", line):
            seen_question_id = True
            continue
        if not seen_question_id:
            continue
        if re.match(r"^[A-D]\.", line):
            break
        body.append(line)

    return clean_line(" ".join(body)) or "Answer the question from the source PDF."


def build_mapped_lines(pdf_path: Path, start_page: int, end_page: int) -> tuple[list[str], int, int]:
    helper = load_helper()
    pages = helper.read_pages(pdf_path)
    default_difficulty = helper.infer_default_difficulty(pdf_path)

    mapped_lines: list[str] = []
    question_count = 0
    multiple_choice_count = 0
    short_answer_count = 0

    for idx, page_text in enumerate(pages, start=1):
        if idx < start_page or idx > end_page:
            continue
        if "Question ID" not in page_text:
            continue

        qid = helper.question_id(page_text, idx)
        question_part, answer_part = helper.split_question_answer(page_text, qid)
        options = helper.extract_options(question_part)
        options = [(label, clean_line(content)) for label, content in options]
        correct = helper.extract_correct_answer(answer_part)
        correct = clean_line(correct) if correct else correct
        answers = [clean_line(answer) for answer in helper.accepted_answers(answer_part, correct)]
        rationale = helper.extract_rationale(answer_part)
        rationale = clean_line(rationale) if rationale else rationale
        difficulty = helper.extract_difficulty(answer_part) or default_difficulty
        category = extract_category(page_text)
        prompt = extract_question_body(question_part, qid)
        is_multiple_choice = bool(options) and bool(correct) and re.fullmatch(r"[A-D]", correct.strip(), re.I)

        question_count += 1
        if is_multiple_choice:
            multiple_choice_count += 1
        else:
            short_answer_count += 1
            if not answers and correct:
                answers = [correct]
            if not answers:
                answers = ["[accepted answer needs review]"]

        header = f"00000_Question_{question_count}({qid})_{category}{'_SC' if is_multiple_choice else ''}"
        mapped_lines.append(header)
        mapped_lines.append(f"00001_{prompt}")
        mapped_lines.append("00002_What is the answer?")

        if not is_multiple_choice:
            mapped_lines.append(f"00003_{' | '.join(answers)}")

        if rationale:
            mapped_lines.append(f"00004_{rationale}")

        if difficulty:
            mapped_lines.append(f"00005_{difficulty}")

        if is_multiple_choice:
            mapped_lines.append("00006_")
            correct_label = correct.strip().upper()
            option_by_label = {label: content for label, content in options}
            for label in ["A", "B", "C", "D"]:
                content = option_by_label.get(label, f"Choice {label} [needs review]")
                suffix = " T (True)" if label == correct_label else ""
                mapped_lines.append(f"- {content}{suffix}")

        mapped_lines.append("==End==")
        mapped_lines.append("")

    return mapped_lines, multiple_choice_count, short_answer_count


def find_font() -> Path | None:
    for path in FONT_PATHS:
        if path.exists():
            return path
    return None


def write_pdf(lines: list[str], out_pdf: Path) -> None:
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    font_path = find_font()
    if not font_path:
        raise SystemExit("Could not find Arial/Arial Unicode font for PDF output")

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_margins(12, 12, 12)
    pdf.add_font("ImportFont", "", str(font_path))
    pdf.add_page()
    pdf.set_font("ImportFont", "", 8)
    max_width = pdf.w - pdf.l_margin - pdf.r_margin

    for line in lines:
        if line == "":
            pdf.ln(2)
            continue
        pdf.multi_cell(max_width, 4.4, line, wrapmode=WrapMode.CHAR, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.output(str(out_pdf))


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a mapped-format SAT import PDF from a Question Bank PDF.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--out-pdf", type=Path, default=DEFAULT_OUT_PDF)
    parser.add_argument("--out-txt", type=Path, default=DEFAULT_OUT_TXT)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--end-page", type=int)
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}")

    require_tool("pdfinfo")
    require_tool("pdftotext")

    total_pages = page_count(args.pdf)
    end_page = args.end_page or total_pages
    if args.start_page < 1 or end_page > total_pages or args.start_page > end_page:
        raise SystemExit(f"Invalid page range {args.start_page}-{end_page}; PDF has {total_pages} pages")

    lines, mc_count, short_count = build_mapped_lines(args.pdf, args.start_page, end_page)
    args.out_txt.write_text("\n".join(lines), encoding="utf-8")
    write_pdf(lines, args.out_pdf)
    question_count = mc_count + short_count
    print(f"Wrote {args.out_pdf}")
    print(f"Wrote {args.out_txt}")
    print(f"questions={question_count} multiple_choice={mc_count} short_answer={short_count}")


if __name__ == "__main__":
    main()

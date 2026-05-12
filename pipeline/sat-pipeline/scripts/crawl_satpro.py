#!/usr/bin/env python3
"""
Crawl SAT Pro Max API.
  - LaTeX ($...$) → converted to readable Unicode text inline
  - <img> tags    → downloaded from server and embedded in PDF
  - Saves raw JSON to output/raw/
  - Generates one PDF per exam to output/pdf/
  - Zips all PDFs to output/sat_exams.zip
"""
import hashlib
import json
import re
import sys
import time
import zipfile
from io import BytesIO
from pathlib import Path

import httpx
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from PIL import Image as PILImage

BASE_URL = "https://satpromaxvip-production.up.railway.app/api/sat"
DELAY = 0.3

OUTPUT    = Path(__file__).parent.parent / "output"
RAW_DIR   = OUTPUT / "raw"
PDF_DIR   = OUTPUT / "pdf"
IMG_CACHE = OUTPUT / "cache" / "images"

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxNTgzLCJlbWFpbCI6Im5naGlsdDE5NDExdXB3b3JrQGdtYWlsLmNvbSIsImlzX2FkbWluIjowLCJyb2xlIjoic3R1ZGVudCIsImV4cCI6MTgwOTk0MTU0MCwiaWF0IjoxNzc4NDA1NTQwLCJ0eXBlIjoiYWNjZXNzIiwianRpIjoiOWZkY2ZlYWUwNTEzNDJiMGFkNDkwNjNhNjhmOTRmY2EifQ.xim7yfq0j7fLoP5A0zoZ33iNqObWBpKecJlV2VDwnt0",
    "origin": "https://www.satgpt.xyz",
    "referer": "https://www.satgpt.xyz/",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
}

PAGE_W  = 190   # usable width in mm (A4 minus margins)
IMG_MAX = 160   # max image width in mm

# Arial Unicode covers all Unicode ranges needed (math symbols, Vietnamese, etc.)
FONT_TTF      = "/Library/Fonts/Arial Unicode.ttf"
FONT_BOLD_TTF = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


# ---------------------------------------------------------------------------
# LaTeX → readable Unicode text
# ---------------------------------------------------------------------------

_SUP = str.maketrans("0123456789+-=()nij", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱʲ")
_SUB = str.maketrans("0123456789aeiounrst", "₀₁₂₃₄₅₆₇₈₉ₐₑᵢₒᵤₙᵣₛₜ")

_SYMBOLS = {
    r"\pi": "π", r"\theta": "θ", r"\alpha": "α", r"\beta": "β",
    r"\gamma": "γ", r"\delta": "δ", r"\sigma": "σ", r"\mu": "μ",
    r"\lambda": "λ", r"\phi": "φ", r"\omega": "ω", r"\rho": "ρ",
    r"\infty": "∞", r"\approx": "≈", r"\neq": "≠",
    r"\leq": "≤", r"\geq": "≥", r"\le": "≤", r"\ge": "≥",
    r"\pm": "±", r"\mp": "∓",
    r"\cdot": "·", r"\times": "×", r"\div": "÷",
    r"\left(": "(", r"\right)": ")",
    r"\left[": "[", r"\right]": "]",
    r"\left|": "|", r"\right|": "|",
    r"\left\{": "{", r"\right\}": "}",
    r"\{": "{", r"\}": "}",
    r"\ldots": "…", r"\cdots": "…",
    r"\,": " ", r"\ ": " ", r"\!": "", r"\;": " ", r"\:": " ",
    r"\quad": "  ", r"\qquad": "    ",
}


def _extract_braced(s, i):
    if i >= len(s) or s[i] != "{":
        return "", i
    depth, start = 0, i + 1
    while i < len(s):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                return s[start:i], i + 1
        i += 1
    return s[start:], i


def _convert_expr(expr):
    for _ in range(8):
        m = re.search(r"\\frac", expr)
        if not m:
            break
        num, i = _extract_braced(expr, m.end())
        den, i = _extract_braced(expr, i)
        expr = expr[: m.start()] + f"({_convert_expr(num)})/({_convert_expr(den)})" + expr[i:]

    expr = re.sub(r"\\sqrt\{([^{}]*)\}", lambda m: f"√({_convert_expr(m.group(1))})", expr)
    expr = re.sub(r"\\sqrt(?!\{)", "√", expr)
    expr = re.sub(r"\^\{([^{}]*)\}", lambda m: m.group(1).translate(_SUP), expr)
    expr = re.sub(r"\^(-?\d+|\w)", lambda m: m.group(1).translate(_SUP), expr)
    expr = re.sub(r"_\{([^{}]*)\}", lambda m: m.group(1).translate(_SUB), expr)
    expr = re.sub(r"_(\w)", lambda m: m.group(1).translate(_SUB), expr)
    for latex_sym, replacement in _SYMBOLS.items():
        expr = expr.replace(latex_sym, replacement)
    expr = re.sub(r"\\text\{([^{}]*)\}", r"\1", expr)
    expr = re.sub(r"\\overline\{([^{}]*)\}", r"\1̄", expr)
    expr = re.sub(r"\\[a-zA-Z]+\{([^{}]*)\}", r"\1", expr)
    expr = re.sub(r"\\[a-zA-Z]+\*?", "", expr)
    expr = expr.replace("{", "").replace("}", "")
    return expr.strip()


def latex_to_text(text):
    text = re.sub(r"\$\$([^$]+)\$\$", lambda m: _convert_expr(m.group(1)), text)
    text = re.sub(r"\$([^$\n]+)\$", lambda m: _convert_expr(m.group(1)), text)
    return text


# ---------------------------------------------------------------------------
# Image downloading
# ---------------------------------------------------------------------------

def download_image(url):
    """Download image, cache as RGB PNG, return local file path or None."""
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.md5(url.encode()).hexdigest()
    cached = IMG_CACHE / f"{key}.png"

    if not cached.exists():
        try:
            r = httpx.get(url, timeout=8, follow_redirects=True)
            r.raise_for_status()
            img = PILImage.open(BytesIO(r.content)).convert("RGB")
            img.save(str(cached), format="PNG")
        except Exception as e:
            print(f"\n    [IMG] download failed {url}: {e}", file=sys.stderr)
            return None

    return str(cached)


def extract_img_urls(html):
    return re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', str(html or ""))


# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------

def strip_html(html):
    if not html:
        return ""
    text = re.sub(r"<li\b[^>]*>", "\n• ", str(html))
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<img[^>]+>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">")
                .replace("&apos;", "'").replace("&quot;", '"'))
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def clean(html):
    return latex_to_text(strip_html(html))


def safe_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


# ---------------------------------------------------------------------------
# PDF builder
# ---------------------------------------------------------------------------

class ExamPDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("Arial", "B", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


def _make_pdf():
    pdf = ExamPDF()
    pdf.set_margins(10, 12, 10)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_font("Arial",  "", FONT_TTF,      uni=True)
    pdf.add_font("Arial",  "B", FONT_BOLD_TTF, uni=True)
    return pdf


def _add_text(pdf, text, bold=False, size=10, indent=0, color=(0, 0, 0)):
    text = text.strip()
    if not text:
        return
    pdf.set_font("Arial", "B" if bold else "", size)
    pdf.set_text_color(*color)
    if indent:
        pdf.set_x(pdf.get_x() + indent)
    # multi_cell handles line wrapping
    pdf.multi_cell(PAGE_W - indent, 5.5, text,
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _add_image(pdf, img_path):
    """Embed image scaled to fit page width, centered."""
    try:
        img = PILImage.open(img_path)
        w_px, h_px = img.size
        # Scale to fit within IMG_MAX mm width
        w_mm = min(IMG_MAX, PAGE_W)
        h_mm = w_mm * h_px / w_px
        # Center horizontally
        x = (210 - w_mm) / 2  # A4 = 210mm wide
        pdf.image(img_path, x=x, w=w_mm, h=h_mm)
        pdf.ln(3)
    except Exception as e:
        print(f"\n    [IMG] embed failed: {e}", file=sys.stderr)


def _add_question(pdf, q):
    num        = q.get("number", "?")
    difficulty = (q.get("difficulty") or "").strip()
    category   = (q.get("category") or "").strip()

    # Question header
    tag = ""
    if difficulty or category:
        tag = "  [" + "  |  ".join(filter(None, [difficulty, category])) + "]"
    pdf.set_font("Arial", "B", 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(PAGE_W, 6, f"Question {num}{tag}",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    raw_passage = q.get("passage") or ""
    raw_content = q.get("content") or ""

    # Embedded images from passage/content
    for url in extract_img_urls(raw_passage) + extract_img_urls(raw_content):
        img_path = download_image(url)
        if img_path:
            _add_image(pdf, img_path)

    # Passage
    passage = clean(raw_passage)
    if passage:
        _add_text(pdf, passage, size=9, indent=5, color=(60, 60, 60))

    # Question prompt
    content = clean(raw_content)
    if content:
        _add_text(pdf, content, bold=True, size=10)

    # Options
    for label, text in sorted((q.get("options") or {}).items()):
        opt = clean(str(text)).strip()
        if opt:
            pdf.set_font("Arial", "", 10)
            pdf.set_text_color(0, 0, 0)
            pdf.set_x(pdf.get_x() + 8)
            pdf.multi_cell(PAGE_W - 8, 5.5, f"{label})  {opt}",
                           new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # Correct answer
    _add_text(pdf, f">> Answer: {q.get('correctAnswer', '')}",
              bold=True, size=10, color=(26, 122, 26))

    # Explanation
    explanation = clean(q.get("explanation_text") or q.get("explanation") or "")
    if explanation:
        _add_text(pdf, f"Explanation: {explanation}", size=9, color=(80, 80, 80))

    # Divider
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.get_x(), pdf.get_y() + 1, pdf.get_x() + PAGE_W, pdf.get_y() + 1)
    pdf.ln(4)


def build_pdf(exam):
    pdf = _make_pdf()
    pdf.add_page()

    # Title
    pdf.set_font("Arial", "B", 16)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(PAGE_W, 9, exam["title"], align="C",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # Metadata lines
    for line in [
        f"Type: {exam.get('type','')}   |   Location: {exam.get('location','')}",
        f"Year: {exam.get('year','')}   Month: {exam.get('month','')}   "
        f"Form: {exam.get('form','')}   Test Type: {exam.get('test_type','')}",
        f"Duration: {exam.get('duration','')} min   "
        f"Total Questions: {exam.get('total_questions','')}",
    ]:
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(PAGE_W, 5, line, align="C",
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)

    for section in exam.get("sections", []):
        pdf.set_font("Arial", "B", 13)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(PAGE_W, 7, section["name"],
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.multi_cell(PAGE_W, 5, f"Duration: {section.get('duration', '')} min",
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(4)

        for q in section.get("questions", []):
            _add_question(pdf, q)

    return pdf.output()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def fetch_exam_list(client):
    for attempt in range(3):
        try:
            r = client.get(f"{BASE_URL}/exams", timeout=30)
            r.raise_for_status()
            return r.json().get("exams", [])
        except Exception as e:
            print(f"  List fetch attempt {attempt+1} failed: {e}", file=sys.stderr)
            time.sleep(3)
    raise RuntimeError("Could not fetch exam list after 3 attempts")


def fetch_exam_detail(client, exam_id):
    try:
        r = client.get(f"{BASE_URL}/exams/{exam_id}", timeout=15)
        if r.status_code in (403, 404):
            return None
        r.raise_for_status()
        data = r.json()
        return None if "detail" in data else data
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)

    with httpx.Client(follow_redirects=True, headers=HEADERS) as client:
        print("Fetching exam list…")
        exams_meta = fetch_exam_list(client)
        total = len(exams_meta)
        print(f"Found {total} accessible exams\n")

        fetched = skipped = 0

        for i, meta in enumerate(exams_meta, 1):
            exam_id = meta["id"]
            title   = meta.get("title", str(exam_id))
            print(f"[{i:3}/{total}] ID {exam_id:6}  {title[:50]:<50} … ", end="", flush=True)

            raw_path = RAW_DIR / f"{exam_id}.json"

            if raw_path.exists():
                exam = json.loads(raw_path.read_text())
                print("cached ", end="")
            else:
                exam = fetch_exam_detail(client, exam_id)
                if exam is None:
                    print("skipped")
                    skipped += 1
                    time.sleep(DELAY)
                    continue
                raw_path.write_text(json.dumps(exam, ensure_ascii=False, indent=2))
                print("fetched", end="")
                time.sleep(DELAY)

            fname    = safe_filename(f"{exam_id}_{exam['title']}") + ".pdf"
            pdf_path = PDF_DIR / fname
            pdf_path.write_bytes(build_pdf(exam))
            print(f"  →  {fname}")
            fetched += 1

    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    zip_path  = OUTPUT / "sat_exams.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in pdf_files:
            zf.write(f, f.name)

    print(f"\n✓  {fetched} exams  |  {skipped} skipped")
    print(f"   PDFs   : {PDF_DIR}  ({len(pdf_files)} files)")
    print(f"   ZIP    : {zip_path}  ({zip_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

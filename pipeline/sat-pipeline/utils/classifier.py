"""
utils/classifier.py — Zero-shot SAT question category classifier.

Uses TF-IDF cosine similarity against per-category signal phrases.
No training data required — works purely from the hardcoded category signals.

Usage:
    from utils.classifier import classify_question

    category = classify_question(
        text="Which choice completes the text with the most logical and precise word or phrase?",
        section="rw",          # "rw" | "math"
        domain=None,           # pass scraped domain to skip classification
    )
    # → "Words in Context"
"""

from __future__ import annotations

import re
from typing import Literal

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ---------------------------------------------------------------------------
# Category definitions — signals are representative phrases / keywords.
# Longer, more specific phrases outweigh single words in TF-IDF scoring.
# ---------------------------------------------------------------------------

_RW_CATEGORIES: dict[str, str] = {
    "Words in Context": (
        "most logical and precise word or phrase "
        "as used in the text most nearly mean "
        "word phrase meaning vocabulary context definition "
        "choose word phrase completes sentence"
    ),
    "Central Ideas and Details": (
        "main idea central idea mainly about primarily about "
        "best summarizes main point main claim central claim "
        "central purpose what does the text indicate "
        "what does the passage mainly discuss"
    ),
    "Command of Evidence – Textual": (
        "best supports most directly supports illustrates the claim "
        "provide evidence undermine weaken support argument "
        "which finding if true would most directly support "
        "which quotation most effectively illustrates"
    ),
    "Command of Evidence – Quantitative": (
        "data graph table figure chart according to the figure "
        "data in the table graph shows percentage number statistic "
        "based on the data which choice most effectively uses data"
    ),
    "Inferences": (
        "most likely inferred can be inferred would most likely "
        "suggests implies conclude what can be concluded "
        "logically follows based on the text the reader can infer"
    ),
    "Text Structure and Purpose": (
        "main purpose primarily serves to overall structure "
        "function of the underlined sentence role of the paragraph "
        "author's purpose why does the author include "
        "how does the structure of the text serve the author"
    ),
    "Cross-Text Connections": (
        "text 1 text 2 author of text 1 author of text 2 "
        "both texts both authors compared to in contrast to "
        "how would the author of text 2 respond to text 1 "
        "what do both passages have in common"
    ),
    "Rhetorical Synthesis": (
        "most effectively uses relevant information from the notes "
        "accomplish this goal student wants to wants to introduce "
        "wants to emphasize draft of an essay taking notes "
        "which choice most effectively accomplishes the student's goal"
    ),
    "Transitions": (
        "most logically completes the text transition word however "
        "therefore furthermore in contrast meanwhile additionally "
        "which choice most logically follows which sentence fits "
        "added here most effective transition"
    ),
    "Standard English Conventions": (
        "conforms to the conventions of standard english "
        "punctuation comma semicolon colon period grammar "
        "verb tense subject verb agreement modifier noun pronoun "
        "sentence boundary run-on fragment possessive apostrophe"
    ),
}

_MATH_CATEGORIES: dict[str, str] = {
    "Algebra": (
        "linear equation linear inequality linear function "
        "slope intercept slope y-intercept x-intercept "
        "system linear equations substitution elimination "
        "solve inequality solution set linear model "
        "linear linear linear equation equation equation "
        "two variables one variable slope-intercept"
    ),
    "Advanced Math": (
        "polynomial quadratic quadratic equation quadratic function "
        "f(x) g(x) h(x) function function zeros roots "
        "vertex parabola leading coefficient degree exponent "
        "radical exponential nonlinear equivalent expression "
        "factored form standard form completing the square "
        "discriminant complex number rewrite simplify expression "
        "exponential growth decay asymptote"
    ),
    "Problem-Solving and Data Analysis": (
        "probability probability probability percent percentage "
        "ratio rate proportion proportional "
        "mean median mode average statistics "
        "data survey sample population margin of error "
        "relative frequency expected value distribution "
        "scatterplot correlation unit conversion "
        "miles per hour dollars per unit cost rate "
        "statistical claim inference random sample"
    ),
    "Geometry and Trigonometry": (
        "triangle triangle angle angle area area volume "
        "circle radius diameter circumference arc sector chord "
        "rectangle perimeter surface area right triangle "
        "sine cosine tangent sin cos tan trigonometric "
        "hypotenuse legs similar triangles congruent "
        "inscribed central angle parallel perpendicular "
        "polygon vertex rotation reflection"
    ),
}

Section = Literal["rw", "math"]

# ---------------------------------------------------------------------------
# Math regex fallback — catches short/equation-only questions that TF-IDF misses
# because they contain too few words to score well.
# Applied BEFORE TF-IDF when section == "math".
# ---------------------------------------------------------------------------

_MATH_REGEX_FALLBACK: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\bsin\b|\bcos\b|\btan\b|\bsine\b|\bcosine\b|\btangent\b|\bhypotenuse\b", re.I),
        "Geometry and Trigonometry",
    ),
    (
        re.compile(r"\btriangle\b|\bcircle\b|\bradius\b|\bdiameter\b|\bperimeter\b|\bsurface area\b", re.I),
        "Geometry and Trigonometry",
    ),
    (
        re.compile(r"\bprobability\b|\bpercent(?:age)?\b|\bproportion\b|\bscatterplot\b|\bmargin of error\b", re.I),
        "Problem-Solving and Data Analysis",
    ),
    (
        re.compile(r"\bf\s*\(\s*x\s*\)|\bquadratic\b|\bpolynomial\b|\bparabola\b|\bdiscriminant\b|\bexponential\b", re.I),
        "Advanced Math",
    ),
]

# ---------------------------------------------------------------------------
# Build one TF-IDF model per section at import time (fast, ~1 ms each).
# ---------------------------------------------------------------------------


def _build_model(categories: dict[str, str]) -> tuple[TfidfVectorizer, list[str]]:
    names = list(categories.keys())
    docs = list(categories.values())
    vec = TfidfVectorizer(ngram_range=(1, 3), sublinear_tf=True)
    vec.fit(docs)
    return vec, names


_rw_vec, _rw_names = _build_model(_RW_CATEGORIES)
_rw_matrix = _rw_vec.transform(list(_RW_CATEGORIES.values()))

_math_vec, _math_names = _build_model(_MATH_CATEGORIES)
_math_matrix = _math_vec.transform(list(_MATH_CATEGORIES.values()))

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_UNKNOWN_VALUES = {"", "unknown", "none", "n/a"}


def classify_question_with_score(
    text: str,
    section: Section = "rw",
    domain: str | None = None,
) -> tuple[str, float]:
    """
    Return (category, confidence_score 0.0–1.0) for a question.

    Args:
        text:    Question stem (and optionally passage) as plain text.
        section: "rw" for Reading & Writing, "math" for Math.
        domain:  If the scraped source already provides a non-empty category,
                 it is returned as-is with score 1.0.

    Returns:
        (category_name, score) where score is 0.0–1.0.
        Returns ("Uncategorized", 0.0) when no confident match is found.
    """
    if domain and domain.lower().strip() not in _UNKNOWN_VALUES:
        return domain.strip(), 1.0

    clean = _clean(text)
    if not clean:
        return "Uncategorized", 0.0

    # Math regex fallback: catches short/equation-only questions before TF-IDF
    if section == "math":
        for pattern, cat in _MATH_REGEX_FALLBACK:
            if pattern.search(clean):
                return cat, 0.75  # regex match → medium-high confidence

    if section == "math":
        vec, names, matrix = _math_vec, _math_names, _math_matrix
    else:
        vec, names, matrix = _rw_vec, _rw_names, _rw_matrix

    q_vec = vec.transform([clean])
    scores = cosine_similarity(q_vec, matrix)[0]
    best_idx = int(scores.argmax())
    best_score = float(scores[best_idx])

    if best_score < 0.05:
        return "Uncategorized", 0.0

    return names[best_idx], best_score


def classify_question(
    text: str,
    section: Section = "rw",
    domain: str | None = None,
) -> str:
    """
    Return the best-matching SAT skill category for a question.
    Convenience wrapper around classify_question_with_score().
    """
    category, _ = classify_question_with_score(text, section, domain)
    return category


def classify_batch(
    questions: list[dict],
    section: Section = "rw",
    text_key: str = "prompt",
    domain_key: str = "domain",
) -> list[str]:
    """
    Classify a list of question dicts in one vectorizer pass.

    Args:
        questions:  List of question dicts.
        section:    "rw" or "math".
        text_key:   Dict key holding the question text.
        domain_key: Dict key holding an already-scraped category (may be absent).

    Returns:
        List of category strings, same order as input.
    """
    results: list[str] = []

    # Separate questions that already have a domain vs those that need classification
    needs_classify: list[int] = []
    texts: list[str] = []

    for i, q in enumerate(questions):
        existing = (q.get(domain_key) or "").lower().strip()
        if existing and existing not in _UNKNOWN_VALUES:
            results.append(q[domain_key].strip())
        else:
            results.append("")  # placeholder
            needs_classify.append(i)
            texts.append(_clean(q.get(text_key) or ""))

    if not needs_classify:
        return results

    if section == "math":
        vec, names, matrix = _math_vec, _math_names, _math_matrix
    else:
        vec, names, matrix = _rw_vec, _rw_names, _rw_matrix

    q_matrix = vec.transform(texts)
    scores_matrix = cosine_similarity(q_matrix, matrix)

    for local_idx, global_idx in enumerate(needs_classify):
        scores = scores_matrix[local_idx]
        best_idx = int(scores.argmax())
        best_score = float(scores[best_idx])
        results[global_idx] = names[best_idx] if best_score >= 0.05 else "Uncategorized"  # noqa: E501

    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = _HTML_TAG_RE.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip().lower()

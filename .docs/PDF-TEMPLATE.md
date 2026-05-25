# PDF-TEMPLATE.md — Real Exam PDF Structure

> **Status:** Draft target structure for PDF imports.
> **Last updated:** 2026-05-25
> **Goal:** PDFs should look like real exam papers, while still giving the parser enough consistent structure to split modules, questions, options, short-answer questions, and correct answers.

---

## Why PDF Is Different From DOCX

The DOCX importer can use document formatting such as bold headings and bold correct options. A real exam PDF should not show parser markers like `**Question 1**` or `- **Options:**`.

For PDF, the parser should rely on:

1. Clear module headings.
2. Question numbers placed consistently.
3. Answer choices labeled consistently.
4. A separate answer key section at the end.

Without an answer key, the parser can extract questions and choices, but it cannot know which option is correct.

For College Board/SAT Question Bank PDFs, prefer converting the PDF into the mapped DOCX/TXT import format from `DOCX-TEMPLATE.md` before upload. Those PDFs often encode math equations as positioned glyphs or images, so the converter should preserve the original question as an embedded image while extracting grading metadata.

---

## SAT Question Bank PDF To Mapped Import

When converting a SAT Question Bank PDF, produce one mapped block per question:

```text
00000_Question_N(QuestionId)_CategoryOrTag_SC
00001_[stimulus/context; insert original question image if math/equations/graphs may be lost]
00002_[direct question prompt]
00003_[accepted answers separated by |, only for student-produced response]
00004_[rationale/explanation]
00005_[difficulty: Easy, Medium, or Hard]
00006_
[choice A text]
[choice B text T (True)]
[choice C text]
[choice D text]
==End==
```

Mapping rules:

- `Question ID` becomes the source code in parentheses: `00000_Question_1(002dba45)_...`.
- The header category/tag is authoritative and should come from the PDF metadata, not from an LLM.
- Use the PDF's `Skill` value as the category/tag when present.
- If `Skill` is unavailable, use the PDF's `Domain` value.
- If neither `Skill` nor `Domain` is available for a Math-only import, use `Math`.
- `Correct Answer:` becomes either the correct option marker `T (True)` for multiple-choice or `00003_` accepted answers for student-produced response.
- `Rationale` becomes `00004_` and is stored as `questions.teacher_explanation`.
- `Question Difficulty:` becomes `00005_` and is stored as `questions.difficulty`.
- Do not include `Assessment`, `Test`, `Domain`, `Skill`, `Difficulty`, page headers, or answer-key labels in `00001_` or `00002_`.

Example:

```text
00000_Question_1(002dba45)_Linear equations in two variables
00001_See the original SAT Math question image below.

[INSERT CROPPED QUESTION IMAGE HERE]

00002_What is the slope of line j?
00003_.1764 | .1765 | 3/17 | 0.176
00004_The correct answer is \(\frac{3}{17}\). It is given that line \(j\) is perpendicular to line \(k\), so the slope of line \(j\) is the negative reciprocal of the slope of line \(k\).
00005_Medium
==End==
```

---

## Required PDF Layout

A PDF should be organized like this:

```text
[Exam title]
[Optional metadata: date, section, timing, question count]

Module 1: Reading and Writing

1
[optional passage/context]
[question stem]

A. [choice A]
B. [choice B]
C. [choice C]
D. [choice D]

2
[question stem]

Student-produced response

Module 2: Reading and Writing
...

Answer Key
Module 1: Reading and Writing
1. A
2. 16

Module 2: Reading and Writing
...
```

---

## Module Headings

Use one of these exact module headings:

```text
Module 1: Reading and Writing
Module 2: Reading and Writing
Module 1: Math
Module 2: Math
```

Recommended:

- Put each module heading on its own line.
- Do not combine module names with page headers or footers.
- Start question numbering after the module heading.

Good:

```text
Math - Module 1
1
In the xy-plane, line k and line l are perpendicular...
```

Also acceptable if normalized by the parser:

```text
Module 1: Math
1
In the xy-plane...
```

Avoid:

```text
Math Questions
Module One
M1
```

---

## Multiple-Choice Question Layout

Real exam style:

```text
1
The National Heritage Fellowship was created to honor exceptional folk and traditional artists in the United States. One artist who received the fellowship is Navajo basket weaver Mary Holiday Black. Black was chosen for her lifetime ______ the arts.

Which choice completes the text with the most logical and precise word or phrase?

A. contributions to
B. doubts about
C. imitations of
D. misunderstandings of
```

Parser expectations:

- Question number is alone or clearly separated: `1`, `2`, `3`, etc.
- Choices are labeled `A.`, `B.`, `C.`, `D.` or `A)`, `B)`, `C)`, `D)`.
- Choices appear after the question stem.
- Exactly four choices means multiple choice.
- Correct answer comes from the answer key, not from bold text in the question body.

---

## Student-Produced Response Layout

Real exam style:

```text
2
If x + 2 = 5, what is the value of x?

Student-produced response
```

Parser expectations:

- Include the phrase `Student-produced response` after the question stem.
- Do not include A-D choices.
- Correct answer comes from the answer key.

---

## Answer Key Section

Place the answer key at the end of the PDF. This section is required for correct answer detection.

Recommended format:

```text
Answer Key

Module 1: Reading and Writing
1. A
2. C
3. D

Module 1: Math
1. C
2. 3
3. 16 | 16.0
```

Rules:

- Multiple-choice answers may be a letter: `A`, `B`, `C`, or `D`.
- Short-answer answers may be text/number values.
- Multiple accepted short-answer variants should be separated by ` | `.
- The answer key question numbers must match the question numbers in the module.

---

## Full Real Exam PDF Example

```text
GD SAT Practice Test
Math · 2 modules · 70 minutes

Module 1: Math

1
If x + 2 = 5, what is the value of x?

A. 1
B. 2
C. 3
D. 4

2
For the positive quantities h, j, and k, 15% of h is equivalent to 20% of j, and j is equivalent to 60% of k. What percentage of k is h?

Student-produced response

Module 2: Math

1
The table shows three values of x and their corresponding values of y. There is a linear relationship between x and y. Which equation represents this relationship?

A. y = 2x + 1
B. y = 3x + 1
C. y = 4x - 1
D. y = 5x - 1

Answer Key

Module 1: Math
1. C
2. 16 | 16.0

Module 2: Math
1. B
```

---

## Layout Guidance For Better Parsing

Use this layout in the PDF source document before exporting:

- Keep one module per continuous section.
- Put each question number on its own line.
- Put each option on its own line.
- Avoid two-column question layouts unless the parser has been specifically tested against them.
- Avoid putting answer choices in tables.
- Keep page numbers, watermarks, and headers/footers visually separate from question text.
- For questions with figures, place the figure immediately after the question number or passage and before the answer choices.
- Keep the answer key in plain text at the end.

---

## What The Current Pipeline PDFs Look Like

Some generated PDFs in `pipeline/sat-pipeline/output/pdf` already look close to this:

```text
Algebra
May 2026 · US · 33 questions · 70 min
Math - Module 1
1
In the xy-plane...
A
B
C
D
...
Student-produced response
```

The problem is that extracted PDF text may separate labels from option text, formulas may move to later lines, and there may be no answer key. That makes parsing possible but more heuristic than DOCX.

For best results, use the stricter layout in this document.

## Bluebooky-Style PDFs Without Answer Keys

The files in `pipeline/sat-pipeline/output/bluebooky/pdf` are text-readable real-exam PDFs, but they are **not import-ready** for the platform question bank.

Observed extraction pattern:

- Questions are numbered, but module headings are not in the accepted `Module N: ...` format.
- Multiple-choice labels such as `A`, `B`, `C`, `D` may be separated from their option text.
- Math formulas can be reordered by PDF text extraction.
- There is no `Answer Key` section at the end of the PDF.

Because the platform must know the correct answer before saving a question, these PDFs can be parsed for preview/review, but they must be treated as **preview only** and blocked from direct database save.

To import this content, first convert it into one of the supported upload formats:

- DOCX using `DOCX-TEMPLATE.md`, with correct options bolded.
- PDF using this template, including a plain-text `Answer Key` section.

Current behavior:

- The parser may extract question stems and visible answer choices for teacher review.
- All parsed questions from PDFs without an `Answer Key` are marked as missing correct answers.
- The save step refuses to persist the import to the question bank until the source file follows a saveable template with correct-answer information.

---

## Common Problems

| Problem | Result |
|---|---|
| PDF is scanned/image-only | Parser cannot extract text |
| Question numbers are embedded inside paragraphs | Parser may miss question boundaries |
| Options are only shown as standalone `A B C D` far away from their text | Parser may not reconstruct choices correctly |
| No answer key | Correct answers cannot be assigned |
| Two-column layout | Text extraction may interleave questions |
| Tables for choices | Text order may be corrupted |
| Heavy math layout | Symbols may extract out of order |

---

## Recommended Implementation Direction

The PDF parser should support two modes:

1. **Structured PDF mode:** Real exam layout described here.
2. **Legacy marker mode:** Existing DOCX-like marker text, for internal test files only.

For production teacher uploads, use structured PDF mode.

---

*Related documents: `DOCX-TEMPLATE.md` · `PRODUCT-ADMIN.md` · `PLAN.md`*

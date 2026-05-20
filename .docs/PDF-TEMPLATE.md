# PDF-TEMPLATE.md — Question Upload Format

> **Status:** Final. Teacher must follow this format exactly for PDF uploads to parse correctly.
> **Last updated:** 2026-05-20
> **Parser:** `pdf-parse` text extraction + custom parser logic

---

## Overview

The platform accepts SAT questions uploaded as text-based `.pdf` files. The PDF parser first extracts plain text, then reads the same question markers used by the DOCX importer.

**The PDF must contain selectable text.** Scanned/image-only PDFs will not parse. If you can drag-select the text in Preview/Chrome, the parser has a chance to read it.

---

## Important PDF Rules

| Rule | Detail |
|---|---|
| Text-based PDF only | Scanned PDFs or screenshot PDFs are not supported |
| Exact markers required | Use `**Module...**`, `**Question N**`, `- **Question:**`, `- **Options:**`, and `- **Answer:**` exactly |
| Correct MC answer | Wrap the entire correct option line in `**...**` |
| One question boundary | Each question starts with `**Question N**` on its own line |
| Four MC options | Multiple-choice questions must have exactly A, B, C, D |
| Short answer | Use `- **Answer:**`, with variants separated by ` | ` |

---

## Accepted Module Headings

Each module starts with one of these headings on its own line:

```text
**Module 1: Reading and Writing**
**Module 2: Reading and Writing**
**Module 1: Math**
**Module 2: Math**
```

Any question before the first module heading will be rejected.

---

## Multiple Choice Format

```text
**Module 1: Math**

**Question 1**
- **Question:** If x + 2 = 5, what is the value of x?
- **Options:**
- A) 1
- B) 2
- **C) 3**
- D) 4
```

### With Reading Passage

```text
**Module 1: Reading and Writing**

**Question 1**
- **Text:** The National Heritage Fellowship was created to honor exceptional folk and traditional artists in the United States. One artist who received the fellowship is Navajo (Diné) basket weaver Mary Holiday Black.
- **Question:** Which choice completes the text with the most logical and precise word or phrase?
- **Options:**
- **A) contributions to**
- B) doubts about
- C) imitations of
- D) misunderstandings of
```

---

## Short Answer Format

```text
**Module 1: Math**

**Question 2**
- **Question:** What is 7 + 5?
- **Answer:** 12
```

For multiple accepted answers:

```text
**Question 3**
- **Question:** For the positive quantities h, j, and k, 15% of h is equivalent to 20% of j, and j is equivalent to 60% of k. What percentage of k is h?
- **Answer:** 16 | 16.0 | 16.00
```

---

## Full PDF Example

Use this exact structure when generating a PDF from Google Docs, Word, Markdown, or HTML:

```text
**Module 1: Reading and Writing**

**Question 1**
- **Text:** The National Heritage Fellowship was created to honor exceptional folk and traditional artists in the United States. One artist who received the fellowship is Navajo (Diné) basket weaver Mary Holiday Black.
- **Question:** Which choice completes the text with the most logical and precise word or phrase?
- **Options:**
- **A) contributions to**
- B) doubts about
- C) imitations of
- D) misunderstandings of

**Module 1: Math**

**Question 1**
- **Question:** If x + 2 = 5, what is the value of x?
- **Options:**
- A) 1
- B) 2
- **C) 3**
- D) 4

**Question 2**
- **Question:** What is 7 + 5?
- **Answer:** 12
```

---

## How To Create A Compatible PDF

1. Write the questions in Google Docs, Microsoft Word, or Markdown using the exact plain-text structure above.
2. Export or print to PDF.
3. Open the PDF and verify the text is selectable.
4. Upload the PDF in the platform.

For the most reliable import, start from `.docs/DOCX-TEMPLATE.md`, then export the same content to PDF.

---

## Common Mistakes That Will Fail Upload

| Mistake | Effect |
|---|---|
| PDF is scanned or image-only | Parser returns no questions |
| Module heading is missing | Parser rejects questions before a module |
| Heading says `Module 1 Math` without colon | Module is invalid |
| Question heading is `Question 1` without `**...**` | Parser cannot find question boundary |
| Correct option is not wrapped in `**...**` | Parser cannot identify correct answer |
| Correct option only bolds the answer text, not the whole line | Parser may fail to mark it correct |
| Options use `A.` instead of `A)` | Parser normalizes some cases, but `A)` is recommended |
| MC question has fewer/more than four choices | Question is rejected |
| Short-answer question includes an `Options` section | Parser treats it as multiple choice |

---

## Notes

- Images, diagrams, and complex layout are not reliable in PDF imports yet. Prefer DOCX for questions with figures.
- Keep each marker on its own line when possible.
- Tables may extract text in unexpected order; avoid tables for the upload source.

---

*Related documents: `DOCX-TEMPLATE.md` · `PRODUCT-ADMIN.md` · `PLAN.md`*

# DOCX-TEMPLATE.md — Question Upload Format

> **Status:** Final. Teacher must follow this format exactly for uploads to parse correctly.
> **Last updated:** 2026-05-10
> **Parser:** Mammoth.js (server-side) + custom parser logic

---

## Overview

The platform accepts SAT questions uploaded as `.docx` (Microsoft Word) files. The parser reads the file and extracts questions, answer choices, correct answers, and module groupings automatically.

**The teacher must follow this format exactly.** Any deviation will cause the upload to fail with an error message showing which line is malformed.

---

## Supported Question Types

| Type | Description |
|---|---|
| Multiple choice | 4 options (A, B, C, D). Correct answer marked in bold |
| Short answer | No options. Correct answer(s) listed after question |

---

## File Structure

A single `.docx` file represents one **Assignment** (one test or practice set).

The file is divided into **Modules**. Each module maps to a section of the SAT (e.g. Reading & Writing Module 1, Math Module 2).

```
[Module heading]
  [Question 1]
  [Question 2]
  ...
[Module heading]
  [Question N]
  ...
```

---

## Module Heading Format

Each module starts with a bold heading on its own line:

```
**Module 1: Reading and Writing**
**Module 2: Math**
```

Accepted module names:
- `Module 1: Reading and Writing`
- `Module 2: Reading and Writing`
- `Module 1: Math`
- `Module 2: Math`

> Any questions before the first module heading will be rejected.

---

## Multiple Choice Question Format

Each question follows this exact structure:

```
**Question N**

- **Text:** [passage or question context — optional]

- **Question:** [the actual question stem]

- **Options:**

- **A) [correct answer text]**

- B) [wrong answer]

- C) [wrong answer]

- D) [wrong answer]
```

### Rules

| Rule | Detail |
|---|---|
| Question number | Must be `**Question N**` where N is an integer. Bold, on its own line |
| Text field | Optional. Use for SAT passage-based questions. Can span multiple lines |
| Question field | Required. The question stem |
| Options field | Required. Exactly 4 options labeled A, B, C, D |
| Correct answer | **Bold the entire option line** including the letter. Only one option should be bold |
| Wrong answers | Plain text (not bold) |
| Blank line | One blank line between each field. One blank line between questions |

### Example — Reading & Writing

```
**Question 1**

- **Text:** The National Heritage Fellowship was created to honor exceptional folk and traditional artists in the United States. One artist who received the fellowship is Navajo (Diné) basket weaver Mary Holiday Black. Black was chosen for her lifetime ______ the arts.

- **Question:** Which choice completes the text with the most logical and precise word or phrase?

- **Options:**

- **A) contributions to**

- B) doubts about

- C) imitations of

- D) misunderstandings of
```

### Example — Math (no passage)

```
**Question 1**

- **Question:** To win a game show, a contestant needs to score at least 70 total points from two rounds. Correct responses in the first round are worth 3 points each, and correct responses in the second round are worth 9 points each. Which inequality models this situation, where f is the number of correct responses in the first round and s is the number of correct responses in the second round?

- **Options:**

- A) f + s ≤ 70

- **B) 3f + 9s ≥ 70**

- C) 9f + s ≥ 70

- D) 9f + 3s ≤ 70
```

---

## Short Answer Question Format

For questions with no answer choices (free response):

```
**Question N**

- **Question:** [question stem]

- **Answer:** [accepted answer 1] | [accepted answer 2] | [accepted answer 3]
```

### Rules

| Rule | Detail |
|---|---|
| No Options field | Short answer questions have no A/B/C/D options |
| Answer field | Required. List all accepted answer variants separated by ` | ` |
| Multiple variants | e.g. `8 | 8.0 | 8.00` or `48 | forty-eight` |

### Example

```
**Question 11**

- **Question:** For the positive quantities h, j, and k, 15% of h is equivalent to 20% of j, and j is equivalent to 60% of k. What percentage of k is h?

- **Answer:** 16 | 16.0
```

---

## Images in Questions

If a question includes a diagram, graph, or figure:

1. Insert the image directly into the Word document using **Insert → Pictures → This Device**
2. Place the image **immediately after the Text field** (or after the Question field if there is no Text)
3. Do NOT paste screenshots — use PNG or JPG files inserted properly
4. Images will be extracted automatically and saved to the platform

```
**Question 2**

- **Text:** [passage]

[IMAGE INSERTED HERE]

- **Question:** Based on the figure, which of the following...

- **Options:**
...
```

---

## Math Formulas

Write math formulas using standard Unicode characters where possible:

| Symbol | How to write |
|---|---|
| Fractions | `1/2`, `3/4` |
| Exponents | `x^2`, `x^3` |
| Square root | `√x` |
| Pi | `π` |
| Greater/less | `≥`, `≤`, `>`, `<` |
| Multiplication | `×` |
| Degrees | `°` |

For complex formulas (e.g. multi-line, matrices), write them as clearly as possible in plain text. The platform renders math using KaTeX — the developer will handle conversion during the review step after upload.

---

## Common Mistakes That Will Fail Upload

| Mistake | Effect |
|---|---|
| No module heading before questions | Upload fails — all questions rejected |
| Question number not bold | Parser cannot find question boundary |
| Correct answer not bold | Parser cannot identify correct answer |
| More or fewer than 4 options (for multiple choice) | Question rejected |
| No `- **Question:**` field | Question rejected |
| Options not labeled A, B, C, D in order | Question rejected |
| Image pasted from clipboard (not inserted as file) | Image extraction fails silently |
| Free-text tags in the document | Ignored — tags are set in platform after upload |

---

## What Happens After Upload

1. Platform parses the file and shows teacher a preview of all extracted questions
2. Questions with parse errors are highlighted in red with the exact error
3. AI suggests skill tags for each question — teacher reviews and confirms
4. Duplicate questions (same content hash) are flagged — teacher chooses to skip, replace, or keep
5. Teacher clicks "Lưu vào ngân hàng" → all valid questions saved to Question Bank
6. Teacher then assigns the questions to a Class + Week as an Assignment Instance

---

## Full File Example

```
**Module 1: Reading and Writing**

**Question 1**

- **Text:** The National Heritage Fellowship was created to honor exceptional folk and traditional artists in the United States.

- **Question:** Which choice completes the text with the most logical word?

- **Options:**

- **A) contributions to**

- B) doubts about

- C) imitations of

- D) misunderstandings of

**Question 2**

- **Question:** Which choice completes the text so that it conforms to Standard English?

- **Options:**

- A) tissue and smooth,

- **B) tissue: smooth,**

- C) tissue smooth,

- D) tissue. Smooth

**Module 2: Math**

**Question 1**

- **Question:** To win a game show, a contestant needs to score at least 70 total points. Which inequality models this situation?

- **Options:**

- A) f + s ≤ 70

- **B) 3f + 9s ≥ 70**

- C) 9f + s ≥ 70

- D) 9f + 3s ≤ 70

**Question 2**

- **Question:** What percentage of k is h?

- **Answer:** 16 | 16.0
```

---

*Related documents: `PRODUCT-ADMIN.md` · `PLAN.md` · `SCHEMA.md`*

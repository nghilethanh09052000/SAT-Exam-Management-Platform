# DOCX-TEMPLATE.md - SAT Question Import Format

> **Status:** Current. Prefer the mapped SAT import format below for AI conversion and bulk uploads.
> **Last updated:** 2026-05-25
> **Parser:** Mammoth.js + mapped-format parser

---

## Recommended Format: Mapped SAT Import

Use this format when converting College Board/SAT PDFs, DOCX files, screenshots, or question-bank exports with AI.

Each question is one block:

```text
00000_Question_N(SourceOrTestCode)_CategoryOrTag_SC
00001_[stimulus, passage, problem context, graph/table context, or empty]
00002_[the actual question prompt]
00003_[accepted answers for student-produced response only, separated by |]
00004_[rationale/explanation, optional]
00005_[difficulty: Easy, Medium, or Hard, optional]
00006_
[answer choice A text]
[answer choice B text T (True)]
[answer choice C text]
[answer choice D text]
==End==
```

For multiple-choice questions, omit `00003_` and mark exactly one answer choice with `T (True)`.

For student-produced response / grid-in questions, include `00003_` and omit the answer choices.

---

## Field Meaning

| Marker | Required | Meaning |
|---|---:|---|
| `00000_` | Yes | Question header and authoritative category/tag |
| `00001_` | Yes | Stimulus/content. For Reading & Writing, this is the left panel. For Math, this can be context, table, graph, or blank |
| `00002_` | Yes | Prompt/question. This is the direct ask |
| `00003_` | Only short answer | Accepted answer variants separated by ` | ` |
| `00004_` | Optional | Rationale/explanation stored as `questions.teacher_explanation` |
| `00005_` | Optional | Difficulty stored as `questions.difficulty`; accepted values: `Easy`, `Medium`, `Hard` |
| `00006_` | Multiple choice only | Starts answer choices. Any trailing text on this line is ignored |
| `T (True)` | Multiple choice only | Correct answer marker. It may be attached directly to the choice text or separated by a space |
| `==End==` | Yes | End of one question block |

Header pattern:

```text
00000_Question_1(PracticeTest1)_Word In Context_SC
```

Header rules:

- `Question_1` is the question number.
- `(PracticeTest1)` or another source code is optional but recommended.
- `Word In Context`, `Linear equations in two variables`, `Algebra`, `Math`, etc. is the category/tag.
- `_SC` is optional and commonly means single correct.
- The category/tag in the header is authoritative. The importer should use it directly and should not ask an LLM to classify the question when this value is present.
- For SAT Question Bank PDFs, prefer the PDF's `Skill` value as the category/tag. If `Skill` is unavailable, use `Domain`. If neither is available, use `Math`.
- Math skill/domain categories such as `Linear equations in two variables`, `Algebra`, `Advanced Math`, `Problem-Solving and Data Analysis`, and `Geometry and Trigonometry` are treated as Math questions by the importer.

---

## Multiple-Choice Example - Reading & Writing

```text
00000_Question_1(Phase2Test5)_Word In Context_SC
00001_Some scientists believe that the same genes that allow bears to hibernate through winter by reducing their breathing and heart rates might be ______ in humans: present but essentially having no influence on our physiological functions.
00002_Which choice completes the text with the most logical and precise word or phrase?
00004_The word "inactive" best indicates that the genes may be present but not influencing the relevant physiological functions.
00005_Medium
00006_
crucial
absent
fluctuating
inactiveT (True)
==End==
```

---

## Multiple-Choice Example - Math

```text
00000_Question_2(SATQuestionBank)_Linear equations in two variables_SC
00001_A cargo helicopter delivers only 100-pound packages and 120-pound packages. For each delivery trip, the helicopter must carry at least 10 packages, and the total weight of the packages can be at most 1,100 pounds.
00002_What is the maximum number of 120-pound packages that the helicopter can carry per trip?
00004_Let x be the number of 120-pound packages and y be the number of 100-pound packages. The constraints are x + y >= 10 and 120x + 100y <= 1100. Testing the greatest possible x gives x = 5.
00005_Medium
00006_
2
4
5 T (True)
6
==End==
```

---

## Student-Produced Response Example - Math

```text
00000_Question_3(SATQuestionBank)_Linear functions
00001_According to a model, the head width, in millimeters, of a worker bumblebee can be estimated by adding 0.6 to four times the body weight of the bee, in grams.
00002_According to the model, what would be the head width, in millimeters, of a worker bumblebee that has a body weight of 0.5 grams?
00003_2.6 | 13/5
00004_Substitute 0.5 for the body weight: 4(0.5) + 0.6 = 2.6.
00005_Easy
==End==
```

---

## Images, Graphs, Tables, and Equations

When converting PDFs, preserve any visual content that cannot be reliably converted to text.

Rules:

- If a graph/table/diagram is part of the question, place the image immediately after `00001_`.
- If math notation is lost during extraction, include a screenshot/crop of the original question in `00001_`.
- Keep answer choices as text whenever possible so the platform can grade multiple-choice questions.
- If an answer choice is only visible as an image/formula, use a short placeholder such as `Choice B (see image)` and keep the original screenshot in the stimulus.
- Do not include answer explanations, rationales, or correct-answer sections in the question image. Crop only the question and choices.

DOCX representation:

```text
00000_Question_12(SATQuestionBank)_Data analysis_SC
00001_See the original graph/table in the image below.

[INSERT QUESTION IMAGE HERE]

00002_Which choice most effectively uses data from the graph to complete the assertion?
00004_The correct choice is supported by comparing the beginning and ending values shown in the graph.
00005_Medium
00006_
around 8% renewable energy in 1990 to around 14% in 2020.
approximately 5% renewable energy in 1990 to more than 20% in 2020. T (True)
less than 5% renewable energy in 1990 to over 25% in 2020.
roughly 8% renewable energy in 1990 to more than 30% in 2020.
==End==
```

---

## AI Conversion Prompt

Use this prompt with another AI when converting a SAT PDF or Word file into the import format:

```text
Convert the attached SAT questions into the mapped SAT import format below.

Output one block per question. Do not include explanations or rationales.

Format:
00000_Question_N(SourceCode)_CategoryOrTag_SC
00001_[stimulus/content/context; preserve paragraph breaks]
00002_[actual question prompt]
00003_[accepted answers separated by |, only for student-produced response]
00004_[rationale/explanation, optional]
00005_[difficulty: Easy, Medium, or Hard, optional]
00006_
[choice A text]
[choice B text T (True)]
[choice C text]
[choice D text]
==End==

Rules:
1. For multiple-choice questions, include exactly 4 choices after 00006_.
2. Mark exactly one correct answer with T (True).
3. For student-produced response questions, omit 00006_ and choices, and include 00003_ with all accepted answers.
4. Put passage/problem context in 00001_ and the direct ask in 00002_.
5. Preserve math notation using LaTeX where possible, such as \(y = 2x + 3\), \(x^2\), \(\frac{3}{17}\).
6. Put the answer explanation or rationale in 00004_. Do not include the literal label "Rationale" unless it is part of the explanation.
7. Put the question difficulty in 00005_ as Easy, Medium, or Hard.
8. Preserve graphs, tables, diagrams, and hard-to-extract equations as images in the DOCX immediately after 00001_.
9. Do not include answer-key section labels such as "Correct Answer:" in the question text.
10. End every question block with ==End==.
11. Use the source document's existing category/tag in the 00000_ header. For SAT Question Bank files, use `Skill` first, then `Domain`, then `Math`. Do not invent or LLM-classify a category when the source already provides one.
```

---

## Legacy DOCX Format

The platform still supports the older teacher-authored DOCX format:

```text
**Module 1: Reading and Writing**

**Question 1**

- **Text:** [optional passage]

- **Question:** [question stem]

- **Options:**

- **A) correct answer**

- B) wrong answer

- C) wrong answer

- D) wrong answer
```

Legacy rules:

- Module heading must be one of:
  - `Module 1: Reading and Writing`
  - `Module 2: Reading and Writing`
  - `Module 1: Math`
  - `Module 2: Math`
- The question heading must be bold: `Question N`.
- Multiple-choice questions need exactly 4 choices.
- The correct multiple-choice option must be bold.
- Short-answer questions use `- **Answer:** answer1 | answer2`.

Use the mapped format for AI conversion and SAT Question Bank imports.

---

*Related documents: `PDF-TEMPLATE.md` · `PRODUCT-ADMIN.md` · `SCHEMA.md`*

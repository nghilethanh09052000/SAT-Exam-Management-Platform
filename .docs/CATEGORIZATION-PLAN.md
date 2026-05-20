# CATEGORIZATION-PLAN.md — SAT Question Auto-Categorization

> **Scope:** Python pipeline (`pipeline/sat-pipeline`) + TypeScript web platform (Next.js + Supabase)
> **Goal:** Every question gets a skill category automatically, with teacher override support.
> **Last updated:** 2026-05-20

---

## 1. Canonical Category Taxonomy

This list is the single source of truth for both systems. Categories map to the `tags` table in the database.

### Reading & Writing (`subject = 'reading_writing'`)

| Category | Description |
|---|---|
| Words in Context | Choosing the most precise word or phrase for a blank |
| Central Ideas and Details | Main idea, summary, what the text mainly discusses |
| Command of Evidence – Textual | Which quote/detail best supports a claim |
| Command of Evidence – Quantitative | Using data from a graph, table, or chart |
| Inferences | What can be inferred, implied, or concluded |
| Text Structure and Purpose | Author's purpose, role of a paragraph, overall structure |
| Cross-Text Connections | Comparing two passages (Text 1 / Text 2) |
| Rhetorical Synthesis | Student "taking notes" → which draft accomplishes the goal |
| Transitions | Most logical transition word/phrase |
| Standard English Conventions | Grammar, punctuation, sentence boundaries |

### Math (`subject = 'math'`)

| Category | Description |
|---|---|
| Algebra | Linear equations, inequalities, systems of equations, slope |
| Advanced Math | Quadratics, polynomials, functions f(x), exponentials, radicals |
| Problem-Solving and Data Analysis | Ratios, percentages, statistics, probability, scatterplots |
| Geometry and Trigonometry | Triangles, circles, area, volume, sin/cos/tan |

---

## 2. Current State

### Python Pipeline ✅ Done

| Component | Status | Location |
|---|---|---|
| TF-IDF classifier | ✅ Built | `utils/classifier.py` |
| Used in PDF export | ✅ Live | `scripts/json_to_pdf.py` |
| Used in bluebooky PDF | ✅ Live | `scripts/bluebooky_to_pdf.py` |
| Used in DOCX export | ⬜ Not yet | `scripts/json_to_docx.py` |
| PDF output format | ✅ `category: X` + `Difficulty: Y` plain text below explanation | |
| DOCX output format | ⬜ Missing `- **skill:** X` bullet | |

### TypeScript Platform ⬜ Not started

| Component | Status |
|---|---|
| Tags seeded in DB | ⬜ `tags` table exists but needs seeding |
| DOCX parser reads `skill:` field | ⬜ Parser ignores it today |
| Auto-classify on upload | ⬜ Not built |
| Teacher review/override UI | ⬜ Not built |
| Category shown on question card | ⬜ Not built |
| Category filter in question bank | ⬜ Not built |

---

## 3. Python Pipeline Plan

### 3.1 How the Classifier Works (already built)

```
Question text (plain)
        │
        ▼
  TF-IDF vectorizer  (built at import time, ~1ms)
        │
        ▼
  Cosine similarity vs. category signal documents
        │
        ▼
  Best match (score ≥ 0.05) → category name
  No match (score < 0.05)   → "Uncategorized"
```

- **No training data** — zero-shot, works from hardcoded keyword signals
- **Domain passthrough** — if scraper already provides a category, skip classification
- **Batch mode** — `classify_batch()` vectorizes all questions in one pass

### 3.2 Remaining Pipeline Tasks

#### Task P1 — Add `skill` bullet to DOCX export

In `scripts/json_to_docx.py`, after the `difficulty` bullet, add a `skill` bullet:

```
- **difficulty:** Medium
- **skill:** Words in Context        ← add this
- **Text:** ...
```

This makes DOCX files importable with category data already embedded, so the
TypeScript parser can read it without re-classifying.

**File:** `scripts/json_to_docx.py`
**Where:** inside `build_docx()`, after writing the difficulty paragraph
**Code pattern:**
```python
category = classify_question(
    text=strip_html(q.get("content", "")),
    section="math" if is_math_section else "rw",
    domain=q.get("domain"),
)
if category and category != "Uncategorized":
    p = doc.add_paragraph(style="List Bullet")
    p.add_run("skill:").bold = True
    p.add_run(f" {category}")
```

#### Task P2 — Confidence score in output

Expose `classify_question_with_score()` that returns `(category, score)` so
downstream tools can decide whether to trust the classification or flag for review.

**File:** `utils/classifier.py`
**Add:**
```python
def classify_question_with_score(
    text: str,
    section: Section = "rw",
    domain: str | None = None,
) -> tuple[str, float]:
    """Returns (category, confidence_score 0.0–1.0)."""
```

#### Task P3 — Improve Math classifier signal phrases

Current accuracy issues:
- Short pure-calculation questions (e.g. `"What is 3x + 2 = 8?"`) sometimes score low
- Geometry questions with no text (image-only) return "Uncategorized"

Fix: Add fallback regex rules for math before invoking TF-IDF:

```python
_MATH_FALLBACK = {
    "Algebra": [r"\bsolve\b.*\bfor\b", r"\bequation\b", r"\by\s*=\s*mx"],
    "Geometry and Trigonometry": [r"\bsin\b|\bcos\b|\btan\b", r"\btriangle\b", r"\bradius\b"],
}
```

---

## 4. TypeScript Platform Plan

### 4.1 Approach Decision

**Rule-based keyword scoring only — no AI, no external API.**

- Zero cost, zero latency, zero external dependency
- Works offline and during Supabase Edge Function cold starts
- Teacher can always override — perfect accuracy is not required at import time
- Same logic as the Python classifier, ported to TypeScript

### 4.2 Rule-Based Classifier (TypeScript port)

**File to create:** `lib/categorization/classifier.ts`

```typescript
// Mirrors utils/classifier.py but in TypeScript
// Keyword scoring — no ML library, no external API

export type Subject = 'reading_writing' | 'math'

export interface ClassifyResult {
  category: string
  confidence: 'high' | 'medium' | 'low'
}

export function classifyQuestion(
  text: string,
  subject: Subject,
  existingDomain?: string  // pass scraped domain to skip classification
): ClassifyResult

export function classifyBatch(
  questions: Array<{ text: string; subject: Subject; domain?: string }>
): ClassifyResult[]
```

**Scoring method:** count keyword hits per category, normalize to 0–1.
- `confidence: 'high'`   → score ≥ 0.4
- `confidence: 'medium'` → score 0.15–0.4
- `confidence: 'low'`    → score < 0.15 → stored as-is, teacher flagged to review

### 4.3 Integration Points

#### A. DOCX Upload Flow

**Trigger:** Teacher uploads `.docx` → `POST /api/questions/upload`

```
parse DOCX (Mammoth.js)
    │
    ▼
for each question:
  if skill bullet present in DOCX ("- **skill:** Words in Context")
    → use directly, confidence = 'high'
  else
    → classifyQuestion(text, subject)   ← rule-based keyword scorer
    │
    ▼
  store in question_tags
  (low-confidence questions flagged ⚠ for teacher review)
```

**File to modify:** `lib/parsers/docx-parser.ts`
- Add parsing of `- **skill:**` bullet into `question.skillTag`
- Pass through to upload handler

**File to modify:** `app/api/questions/upload/route.ts`
- After parsing, call classifier for questions without a `skillTag`
- Insert rows into `question_tags`

#### B. Manual Question Creation

When teacher creates a question manually in the UI, auto-suggest the category after they finish typing the question text (debounced 1s):

```
Teacher types question
    → debounce 1s
    → POST /api/questions/classify
    → classifyQuestion() server-side (rule-based, no AI)
    → return suggestion to UI
    → teacher sees suggested badge, can accept or change
```

**File to create:** `app/api/questions/classify/route.ts`

#### C. Existing Questions (Backfill)

One-time migration to classify all questions that have no tag yet:

```
Admin panel → "Classify All" button
    → GET /api/admin/backfill-categories
    → batch classifyQuestion() for all untagged questions
    → insert into question_tags
```

**File to create:** `app/api/admin/backfill-categories/route.ts`

---

## 5. Database Changes

### 5.1 Seed the `tags` Table

The `tags` table already exists. Needs a migration to seed the canonical 14 categories:

```sql
-- Migration: seed_sat_categories
INSERT INTO tags (id, subject, name) VALUES
  -- Reading & Writing
  (gen_random_uuid(), 'reading_writing', 'Words in Context'),
  (gen_random_uuid(), 'reading_writing', 'Central Ideas and Details'),
  (gen_random_uuid(), 'reading_writing', 'Command of Evidence – Textual'),
  (gen_random_uuid(), 'reading_writing', 'Command of Evidence – Quantitative'),
  (gen_random_uuid(), 'reading_writing', 'Inferences'),
  (gen_random_uuid(), 'reading_writing', 'Text Structure and Purpose'),
  (gen_random_uuid(), 'reading_writing', 'Cross-Text Connections'),
  (gen_random_uuid(), 'reading_writing', 'Rhetorical Synthesis'),
  (gen_random_uuid(), 'reading_writing', 'Transitions'),
  (gen_random_uuid(), 'reading_writing', 'Standard English Conventions'),
  -- Math
  (gen_random_uuid(), 'math', 'Algebra'),
  (gen_random_uuid(), 'math', 'Advanced Math'),
  (gen_random_uuid(), 'math', 'Problem-Solving and Data Analysis'),
  (gen_random_uuid(), 'math', 'Geometry and Trigonometry')
ON CONFLICT DO NOTHING;
```

**File:** `supabase/migrations/<timestamp>_seed_sat_categories.sql`

### 5.2 No Schema Changes Required

The `tags` + `question_tags` many-to-many structure already supports this.
We store exactly one tag per question (the skill category).

**Convention:** one `question_tags` row per question (not multiple) for skill category.
If a question needs additional tags (e.g. topic tags), those are separate rows.

### 5.3 Optional: Add `classification_confidence` Column

If we want to track low-confidence classifications for teacher review:

```sql
ALTER TABLE question_tags
  ADD COLUMN confidence TEXT CHECK (confidence IN ('high', 'medium', 'low', 'manual'))
  DEFAULT 'high';
```

- `high`   → rule-based, strong match
- `medium` → rule-based, weak match
- `low`    → AI classified
- `manual` → teacher set explicitly

**File:** `supabase/migrations/<timestamp>_add_tag_confidence.sql`

---

## 6. DOCX Template Changes

Add `- **skill:**` bullet to the DOCX template so imported files carry the category.
Parser ignores unrecognized bullets, so this is backward-compatible.

**Updated question block format:**

```
**Question 1**
- **difficulty:** Medium
- **skill:** Words in Context
- **Text:** Many people use the trademark "Kleenex"…
- **Question:** What does the text suggest about the term "cellophane"?
- **Options:**
  - It is the subject of great debate.
  - **It once referred to a specific product.** ← bold = correct
  - It has recently become popular.
  - It was never intended as a trademark.
- **explanation:** The passage states that "cellophane" was judged generic…
```

**File to update:** `.docs/DOCX-TEMPLATE.md`
**File to update:** `lib/parsers/docx-parser.ts` — parse `skill:` bullet
**File to update:** `scripts/json_to_docx.py` — emit `skill:` bullet (Task P1)

---

## 7. Teacher Override UI

### Question Bank — Tag Editor

On any question card, teacher can click the category badge to change it:

```
┌─────────────────────────────────────────────┐
│  Q1  What does the text suggest about…      │
│                                             │
│  Category: [Words in Context ▾]  ← dropdown │
│  Difficulty: [Medium ▾]                     │
│  Confidence: ⚠ Medium                       │
└─────────────────────────────────────────────┘
```

- Dropdown lists all categories for the question's subject (RW or Math)
- On change: `PATCH /api/questions/:id/tag` → update `question_tags`, set `confidence = 'manual'`
- Low-confidence questions flagged with ⚠ icon so teacher knows to review

### Upload Review Screen

After DOCX upload, before saving, show a review table:

```
┌──────┬──────────────────────────┬──────────────────────────┬────────────┐
│  #   │  Question (truncated)    │  Detected Category       │  Confidence│
├──────┼──────────────────────────┼──────────────────────────┼────────────┤
│  1   │  What does the text…     │  Central Ideas  ▾        │  ✓ High    │
│  2   │  Which choice…           │  Words in Context ▾      │  ✓ High    │
│  3   │  Based on the graph…     │  Cmd of Evidence–Quant ▾ │  ⚠ Medium  │
│  4   │  Solve for x in…         │  Algebra ▾               │  ✓ High    │
└──────┴──────────────────────────┴──────────────────────────┴────────────┘
```

Teacher can change any category before confirming the import.

---

## 8. Implementation Phases

### Phase 1 — Pipeline (Python) · ~1–2 days

| # | Task | File | Status |
|---|---|---|---|
| P1 | Add `skill` bullet to DOCX export | `scripts/json_to_docx.py` | ⬜ |
| P2 | Add `classify_question_with_score()` | `utils/classifier.py` | ⬜ |
| P3 | Add regex fallback for Math | `utils/classifier.py` | ⬜ |
| P4 | Re-run batch DOCX export with skill field | `scripts/batch_to_pdf.py` analog for DOCX | ⬜ |

### Phase 2 — Database · ~0.5 days

| # | Task | File | Status |
|---|---|---|---|
| D1 | Migration: seed 14 category tags | `supabase/migrations/` | ⬜ |
| D2 | Migration: add `confidence` to `question_tags` (optional) | `supabase/migrations/` | ⬜ |

### Phase 3 — TypeScript Classifier · ~1–2 days

| # | Task | File | Status |
|---|---|---|---|
| T1 | Build rule-based TS classifier | `lib/categorization/classifier.ts` | ⬜ |
| T2 | Expose `/api/questions/classify` route | `app/api/questions/classify/route.ts` | ⬜ |
| T3 | Parse `skill:` bullet in DOCX parser | `lib/parsers/docx-parser.ts` | ⬜ |

### Phase 4 — Upload Integration · ~1 day

| # | Task | File | Status |
|---|---|---|---|
| U1 | Auto-classify on DOCX upload | `app/api/questions/upload/route.ts` | ⬜ |
| U2 | Show category in upload review table | `components/question-bank/UploadReview.tsx` | ⬜ |
| U3 | Allow override in review table | same | ⬜ |

### Phase 5 — Question Bank UI · ~1 day

| # | Task | File | Status |
|---|---|---|---|
| Q1 | Show category badge on question card | `components/question-bank/QuestionCard.tsx` | ⬜ |
| Q2 | Inline category editor (dropdown) | same | ⬜ |
| Q3 | Filter question bank by category | `app/(teacher)/question-bank/page.tsx` | ⬜ |
| Q4 | Backfill endpoint + admin button | `app/api/admin/backfill-categories/route.ts` | ⬜ |

---

## 9. Data Flow Summary

```
                    PYTHON PIPELINE
                    ─────────────────────────────────────────
scraped JSON        classify_question()   json_to_docx.py
  (domain?)    ──►  TF-IDF classifier  ──►  DOCX with
  (no domain?)      (classifier.py)         - skill: Words in Context
                                            - difficulty: Medium
                                               │
                                               ▼ teacher imports DOCX
                    TYPESCRIPT PLATFORM
                    ─────────────────────────────────────────
                    docx-parser.ts reads "skill:" bullet
                               │
                    ┌──────────┴──────────────┐
                    │ skill present?           │ skill missing?
                    ▼                          ▼
              use directly           classifyQuestion() [TS keyword scorer]
              confidence = high           │
                                   ┌──────┴────────────────┐
                                   │ confidence high/medium │ confidence low?
                                   ▼                        ▼
                             store directly          store with ⚠ flag
                                   │                 teacher reviews in UI
                                   └──────┬──────────┘
                                          ▼
                                   question_tags row inserted
                                   (teacher can override anytime)
```

---

## 10. Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Storage model | `tags` + `question_tags` (existing) | Already in schema, no migration needed |
| TS classifier method | Keyword scoring (not TF-IDF) | No ML library dependency in Next.js |
| Low-confidence fallback | Flag for teacher review | No AI — teacher is the fallback |
| DOCX format | Add `- **skill:**` bullet | Parser-safe, backward-compatible, human-readable |
| Teacher override | Yes, always | Classifier is a suggestion, not ground truth |
| Category per question | Exactly one skill tag | SAT questions target one skill at a time |

---

*Related documents: `SCHEMA.md` · `DOCX-TEMPLATE.md` · `PDF-TEMPLATE.md` · `CLAUDE.md`*
*Pipeline code: `pipeline/sat-pipeline/utils/classifier.py`*

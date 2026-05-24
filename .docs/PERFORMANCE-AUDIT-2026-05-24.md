# Performance Audit — 2026-05-24

Full audit of API routes and components. Each case includes the problem,
the SQL it generates today, and the concrete fix with corrected SQL.

---

## Severity Legend

| Icon | Severity | Impact |
|------|----------|--------|
| 🔴 | Critical | Hits every user every session |
| 🟠 | High | Frequent, noticeable latency |
| 🟡 | Medium | Grows worse as data grows |

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical | `submissions/[id]/submit/route.ts` | N+1: 44 DB queries on submit → move to queue worker |
| 2 | 🔴 Critical | `student/test/[instanceId]/page.tsx` | 4-level deep join dumps full exam into SSR HTML |
| 3 | 🟠 High | `submission-answers/route.ts` | Sequential double query on every auto-save |
| 4 | 🟠 High | `teacher/assignments/[id]/page.tsx` | Eagerly loads full question detail for all questions |
| 5 | 🟠 High | `test-interface.tsx` | Progress PATCH fires on every question navigation, no debounce |
| 6 | 🟡 Medium | `exam-papers/route.ts` | No pagination — returns all exam papers forever |
| 7 | 🟡 Medium | `questions/route.ts` | Two sequential queries + large IN list for tag filter |
| 8 | 🟡 Medium | `submissions/route.ts` | No LIMIT on submissions list |
| 9 | 🟡 Medium | `free-test/test/[paperId]/page.tsx` | 5 sequential queries, none parallelized |

---

## 🔴 Case 1 — N+1 Queries on Test Submit

**File:** `app/api/submissions/[id]/submit/route.ts`

### Problem

When a student submits a 44-question test, the route loops over every answer
and fires a **separate DB query per answer** using `Promise.all`. For a full
SAT exam this is 44 simultaneous round-trips — one per question.

```ts
// ❌ Current code — N+1 pattern
await Promise.all(
  answers.map(async (answer) => {
    if (answer.selected_option_id) {
      // Fires once per MCQ answer (e.g. 38 times)
      await supabase
        .from('question_options')
        .select('is_correct')
        .eq('id', answer.selected_option_id)
        .single()
    } else if (answer.answer_text) {
      // Fires once per short-answer (e.g. 6 times)
      await supabase
        .from('question_accepted_answers')
        .select('answer_text')
        .eq('question_id', answer.question_id)
    }
  })
)
```

### SQL Generated (runs 44 times per submit)

```sql
-- Fires 38 times — once per MCQ answer
SELECT is_correct
FROM question_options
WHERE id = 'opt-uuid-001';

-- Fires 6 times — once per short-answer question
SELECT answer_text
FROM question_accepted_answers
WHERE question_id = 'q-uuid-039';
```

**Total: 44 round-trips to Postgres for a single submit click.**

---

### Fix — Move Grading to a Queue Worker

The submit route becomes thin (verify + mark as grading + enqueue).
The grading worker does the heavy work independently per student.
This means Student A and Student B each get their own worker instance
running in parallel — they never wait for each other.

```
Student A clicks Submit        Student B clicks Submit
  → POST /api/submissions/A/submit   → POST /api/submissions/B/submit
    → mark as 'grading' (1 query)      → mark as 'grading' (1 query)
    → enqueue message (~5ms)           → enqueue message (~5ms)
    ← 202 Accepted immediately         ← 202 Accepted immediately

       Worker A (Vercel Fluid)              Worker B (Vercel Fluid)
         → 2 batch queries                    → 2 batch queries
         → grade in memory                    → grade in memory
         → 2 writes                           → 2 writes
         ← done                               ← done
```

#### Step 1 — Thin submit route (verify + guard + enqueue)

```ts
// app/api/submissions/[id]/submit/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  // Atomic check + status flip — only ONE request can win this race.
  // If student double-clicks Submit, the second request gets 0 rows back → 409.
  const { data: updated } = await raw
    .from('submissions')
    .update({ status: 'grading', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')   // ← guard: only flips if still in_progress
    .select('id')
    .single()

  if (!updated) {
    return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
  }

  // Enqueue — takes ~5ms, not 500ms
  await queueClient.send({
    topic: QUEUE_TOPICS.gradeSubmission,
    payload: {
      job:                'grade-submission',
      submissionId:       params.id,
      studentId:          user.id,
      answers:            parsed.data.answers,
      time_spent_seconds: parsed.data.time_spent_seconds,
    },
  })

  return NextResponse.json({ data: { status: 'grading' }, error: null }, { status: 202 })
}
```

#### SQL the thin route generates (3 queries total, always)

```sql
-- 1. Auth check (cached — no extra round-trip)

-- 2. Atomic guard + status flip (one round-trip, one row)
UPDATE submissions
SET    status     = 'grading',
       updated_at = NOW()
WHERE  id         = 'sub-uuid-123'
  AND  student_id = 'user-uuid-456'
  AND  status     = 'in_progress'   -- ← prevents double-submit
RETURNING id;
-- Returns 1 row → enqueue proceeds
-- Returns 0 rows → another request already won → 409

-- 3. Queue message sent (not a DB query — HTTP to Vercel Queues)
```

#### Step 2 — Grading worker (2 batch queries instead of 44)

```ts
// lib/jobs/grade-submission.ts
export async function runGradeSubmissionJob(payload: GradeSubmissionPayload) {
  const { submissionId, answers, time_spent_seconds } = payload
  const raw = rawClient()

  // Collect all IDs upfront
  const optionIds     = answers.map(a => a.selected_option_id).filter(Boolean) as string[]
  const saQuestionIds = answers.filter(a => a.answer_text && !a.selected_option_id).map(a => a.question_id)

  // ✅ 2 parallel reads — replaces the old 44 sequential queries
  const [optionsRes, acceptedRes] = await Promise.all([
    optionIds.length > 0
      ? raw.from('question_options').select('id, is_correct').in('id', optionIds)
      : Promise.resolve({ data: [] }),
    saQuestionIds.length > 0
      ? raw.from('question_accepted_answers').select('question_id, answer_text').in('question_id', saQuestionIds)
      : Promise.resolve({ data: [] }),
  ])

  // Build lookup maps — zero extra DB calls
  const optionMap  = new Map((optionsRes.data ?? []).map(o => [o.id, o.is_correct]))
  const acceptedMap = new Map<string, string[]>()
  for (const row of (acceptedRes.data ?? [])) {
    const list = acceptedMap.get(row.question_id) ?? []
    list.push(row.answer_text)
    acceptedMap.set(row.question_id, list)
  }

  // Grade every answer in memory — no DB calls
  const processedAnswers = answers.map(answer => {
    let is_correct: boolean | null = null
    if (answer.selected_option_id) {
      is_correct = optionMap.get(answer.selected_option_id) ?? null
    } else if (answer.answer_text) {
      const accepted = acceptedMap.get(answer.question_id) ?? []
      is_correct = accepted.length > 0 ? isShortAnswerCorrect(answer.answer_text, accepted) : null
    }
    return { submission_id: submissionId, question_id: answer.question_id, is_correct, ... }
  })

  const rawScore = calculateRawScore(processedAnswers)

  // ✅ 2 parallel writes
  await Promise.all([
    raw.from('submission_answers')
       .upsert(processedAnswers, { onConflict: 'submission_id,question_id' }),
    raw.from('submissions')
       .update({ status: 'submitted', raw_score: rawScore, total_questions: answers.length, submitted_at: new Date().toISOString() })
       .eq('id', submissionId),
  ])
}
```

#### SQL the worker generates (4 queries total, always)

```sql
-- Query 1: batch fetch all MCQ option results (1 query for all 38)
SELECT id, is_correct
FROM question_options
WHERE id IN (
  'opt-uuid-001', 'opt-uuid-002', ..., 'opt-uuid-038'
);

-- Query 2: batch fetch all short-answer accepted answers (1 query for all 6)
SELECT question_id, answer_text
FROM question_accepted_answers
WHERE question_id IN (
  'q-uuid-039', 'q-uuid-040', ..., 'q-uuid-044'
);

-- Query 3: upsert all 44 answers in one statement
INSERT INTO submission_answers
  (submission_id, question_id, selected_option_id, answer_text, is_correct, ...)
VALUES
  ('sub-123', 'q-001', 'opt-A', null, true,  ...),
  ('sub-123', 'q-002', 'opt-C', null, false, ...),
  -- ... 42 more rows
ON CONFLICT (submission_id, question_id) DO UPDATE SET
  selected_option_id   = EXCLUDED.selected_option_id,
  is_correct           = EXCLUDED.is_correct,
  time_spent_seconds   = EXCLUDED.time_spent_seconds;

-- Query 4: mark submission as submitted
UPDATE submissions
SET    status          = 'submitted',
       raw_score       = 38,
       total_questions = 44,
       submitted_at    = NOW(),
       updated_at      = NOW()
WHERE  id = 'sub-uuid-123';
```

| | Before | After |
|---|---|---|
| Queries per submit | 44+ | 4 |
| Student wait time | ~500ms | ~15ms (202 instantly) |
| 50 simultaneous submits | 2,200 DB queries | 200 DB queries |
| Double-submit safe | ❌ No | ✅ Yes (atomic guard) |

---

## 🔴 Case 2 — Massive Nested Join on Test Load

**File:** `app/[locale]/(student)/student/test/[instanceId]/page.tsx` · line 92

### Problem

The test page loads the entire exam in one 4-level deep join. For a 44-question
SAT exam with 4 options each, this returns 176 rows with full question content
(some passages are 1,000+ words) all serialized into `__NEXT_DATA__` in the HTML.

```ts
// ❌ Current code — 4-level deep join
supabase
  .from('assignment_instances')
  .select(
    'id, deadline, is_timed, time_limit_seconds, shuffle_questions, shuffle_options, max_retakes, assignment_id, assignments(title, assignment_questions(id, question_id, order, module, questions(id, type, content, question_options(id, label, content, order))))'
  )
  .eq('id', params.instanceId)
  .single()
```

### SQL Generated

```sql
SELECT
  ai.id, ai.deadline, ai.is_timed, ai.time_limit_seconds,
  ai.shuffle_questions, ai.shuffle_options, ai.max_retakes,

  a.title,

  aq.id AS aq_id, aq.question_id, aq.order, aq.module,

  q.id  AS q_id,
  q.type,
  q.content,          -- ← full text, can be 2 KB per reading passage

  qo.id AS qo_id,
  qo.label,
  qo.content,         -- ← answer text repeated across 176 rows
  qo.order

FROM assignment_instances ai
JOIN assignments a
  ON a.id = ai.assignment_id
JOIN assignment_questions aq
  ON aq.assignment_id = a.id
JOIN questions q
  ON q.id = aq.question_id
LEFT JOIN question_options qo
  ON qo.question_id = q.id
WHERE ai.id = $1
  AND ai.published_at IS NOT NULL;
-- Returns 176 rows (44 questions × 4 options)
-- All serialized into __NEXT_DATA__ — easily 200–500 KB before gzip
```

### Fix — Split into 2 focused queries

```ts
// ✅ Query 1: instance metadata only (tiny, fast)
const [instanceResult, existingResult] = await Promise.all([
  supabase
    .from('assignment_instances')
    .select('id, deadline, is_timed, time_limit_seconds, shuffle_questions, shuffle_options, max_retakes, assignment_id, assignments(title)')
    .eq('id', params.instanceId)
    .not('published_at', 'is', null)
    .single(),
  // existing in-progress submission (already parallel in current code)
  supabase
    .from('submissions')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('instance_id', params.instanceId)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .single(),
])

// ✅ Query 2: questions + options, separate and focused
const questionsResult = await supabase
  .from('assignment_questions')
  .select('id, question_id, order, module, questions(id, type, content, question_options(id, label, content, order))')
  .eq('assignment_id', instance.assignment_id)
  .order('order', { ascending: true })
```

### Fixed SQL

```sql
-- Query 1: instance + assignment title only
SELECT
  ai.id, ai.deadline, ai.is_timed, ai.time_limit_seconds,
  ai.shuffle_questions, ai.shuffle_options, ai.max_retakes, ai.assignment_id,
  a.title
FROM assignment_instances ai
JOIN assignments a ON a.id = ai.assignment_id
WHERE ai.id = $1
  AND ai.published_at IS NOT NULL;
-- Returns 1 row

-- Query 2: questions + options (flat, no instance duplication)
SELECT
  aq.id, aq.question_id, aq.order, aq.module,
  q.id, q.type, q.content,
  qo.id, qo.label, qo.content, qo.order
FROM assignment_questions aq
JOIN questions q          ON q.id = aq.question_id
LEFT JOIN question_options qo ON qo.question_id = q.id
WHERE aq.assignment_id = $1
ORDER BY aq.order ASC, qo.order ASC;
-- Returns 176 rows, but NOT nested inside a single massive JSON object
```

---

## 🟠 Case 3 — Sequential Double Query on Every Auto-Save

**File:** `app/api/submission-answers/route.ts`

### Problem

Every time a student selects an answer (debounced 400ms), the route fires
**2 sequential DB round-trips** — the second cannot start until the first finishes.
Over a 2-hour SAT session this happens hundreds of times.

```ts
// ❌ Current code — 2 sequential queries per auto-save
// Round-trip 1 — verify ownership
const submissionResult = await supabase
  .from('submissions')
  .select('id, student_id, status')
  .eq('id', parsed.data.submission_id)
  .eq('student_id', user.id)
  .single()

const submission = submissionResult.data
if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
if (submission.status !== 'in_progress') return 409

// Round-trip 2 — only starts after round-trip 1 finishes
await raw.from('submission_answers').upsert({ ... })
```

### SQL Generated (sequentially, per auto-save)

```sql
-- Round-trip 1 (~5–10ms network)
SELECT id, student_id, status
FROM submissions
WHERE id         = 'sub-uuid-123'
  AND student_id = 'user-uuid-456';

-- Round-trip 2 — only starts after round-trip 1 returns (~5–10ms more)
INSERT INTO submission_answers
  (submission_id, question_id, selected_option_id, is_marked_for_review, ...)
VALUES ('sub-uuid-123', 'q-uuid-001', 'opt-uuid-B', false, ...)
ON CONFLICT (submission_id, question_id) DO UPDATE SET
  selected_option_id   = EXCLUDED.selected_option_id,
  is_marked_for_review = EXCLUDED.is_marked_for_review,
  updated_at           = EXCLUDED.updated_at;
-- Total: ~10–20ms pure latency overhead per answer selection
```

### Fix — Push the ownership check into an RLS policy

Add this policy in a Supabase migration so Postgres enforces ownership
in the same transaction as the upsert, eliminating the separate SELECT:

```sql
-- supabase/migrations/XXXX_rls_submission_answers.sql
CREATE POLICY "student can upsert own in-progress answers"
ON submission_answers
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id         = submission_answers.submission_id
      AND s.student_id = auth.uid()
      AND s.status     = 'in_progress'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id         = submission_answers.submission_id
      AND s.student_id = auth.uid()
      AND s.status     = 'in_progress'
  )
);
```

```ts
// ✅ Fixed route — single round-trip, RLS enforces ownership
export async function POST(req: Request) {
  const supabase = createServerClient()  // anon client — RLS applies
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = UpsertAnswerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  // One query — Postgres checks ownership via RLS inside the same transaction
  const { data, error } = await supabase
    .from('submission_answers')
    .upsert({ ...parsed.data, answered_at: new Date().toISOString() },
             { onConflict: 'submission_id,question_id' })
    .select('id, question_id')
    .single()

  if (error?.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}
```

### Fixed SQL

```sql
-- Single statement — RLS check runs inside Postgres, no extra round-trip
INSERT INTO submission_answers
  (submission_id, question_id, selected_option_id, ...)
VALUES ('sub-uuid-123', 'q-uuid-001', 'opt-uuid-B', ...)
ON CONFLICT (submission_id, question_id) DO UPDATE SET
  selected_option_id = EXCLUDED.selected_option_id,
  updated_at         = EXCLUDED.updated_at;
-- Postgres internally runs the EXISTS check from the RLS policy.
-- If student_id doesn't match or status != 'in_progress' → 42501 (permission denied)
-- Otherwise → upsert succeeds
-- Total: 1 round-trip instead of 2
```

---

## 🟠 Case 4 — Eager Full Question Fetch on Teacher Assignment Page

**File:** `app/[locale]/(teacher)/teacher/assignments/[id]/page.tsx` · line 87

### Problem

Every page load fetches `ai_explanation` and `teacher_explanation` (long text
fields), all options, and all accepted answers for every question — even though
this data is only shown when the teacher clicks "Xem" on one specific question.

```ts
// ❌ Current code — fetches everything upfront
supabase
  .from('assignment_questions')
  .select(`
    id, order, score_weight, module,
    question:questions(
      id, type, content, difficulty,
      ai_explanation,          -- ← long text, loaded for ALL questions
      teacher_explanation,     -- ← long text, loaded for ALL questions
      question_options(id, label, content, is_correct, order),
      question_accepted_answers(id, answer_text)
    )
  `)
  .eq('assignment_id', params.id)
  .order('order', { ascending: true })
```

### SQL Generated

```sql
SELECT
  aq.id, aq.order, aq.score_weight, aq.module,
  q.id, q.type, q.content, q.difficulty,
  q.ai_explanation,          -- ← fetched for every question on every page load
  q.teacher_explanation,     -- ← fetched for every question on every page load
  qo.id, qo.label, qo.content, qo.is_correct, qo.order,
  qaa.id, qaa.answer_text
FROM assignment_questions aq
JOIN questions q
  ON q.id = aq.question_id
LEFT JOIN question_options qo
  ON qo.question_id = q.id
LEFT JOIN question_accepted_answers qaa
  ON qaa.question_id = q.id
WHERE aq.assignment_id = $1
ORDER BY aq.order ASC;
-- ai_explanation + teacher_explanation can be 500–2,000 chars each
-- Fetched for all 44 questions even when teacher just wants the list
```

### Fix — Lightweight list on load, lazy detail on click

```ts
// ✅ Page load — minimal fields only
supabase
  .from('assignment_questions')
  .select('id, order, score_weight, module, question:questions(id, type, content, difficulty)')
  .eq('assignment_id', params.id)
  .order('order', { ascending: true })
  // No ai_explanation, teacher_explanation, options, or accepted answers
```

```ts
// ✅ When teacher clicks "Xem" — fetch full detail for that one question
// Hits existing GET /api/questions/[id] endpoint
const res  = await fetch(`/api/questions/${questionId}`)
const data = await res.json()
// Opens modal with full content
```

### Fixed SQL

```sql
-- Page load — fast, small payload
SELECT
  aq.id, aq.order, aq.score_weight, aq.module,
  q.id, q.type, q.content, q.difficulty
FROM assignment_questions aq
JOIN questions q ON q.id = aq.question_id
WHERE aq.assignment_id = $1
ORDER BY aq.order ASC;
-- No joins to question_options or question_accepted_answers
-- No ai_explanation or teacher_explanation columns

-- On "Xem" click — one question at a time
SELECT
  q.id, q.type, q.content, q.difficulty,
  q.ai_explanation,
  q.teacher_explanation,
  qo.id, qo.label, qo.content, qo.is_correct, qo.order,
  qaa.id, qaa.answer_text
FROM questions q
LEFT JOIN question_options qo
  ON qo.question_id = q.id
LEFT JOIN question_accepted_answers qaa
  ON qaa.question_id = q.id
WHERE q.id = $1;
```

---

## 🟠 Case 5 — Progress PATCH Fires on Every Question Navigation

**File:** `app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx` · lines 467–478

### Problem

A `useEffect` fires a PATCH request every time `currentQuestion` changes —
with no debounce. A student clicking Next/Back rapidly through 44 questions
fires 44 requests in quick succession.

```ts
// ❌ Current code — no debounce
useEffect(() => {
  if (!currentQuestion) return
  fetch(progressEndpoint ?? `/api/submissions/${submissionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_question_id: currentQuestion.questionId,
      current_module: currentModule,
    }),
  }).catch(() => undefined)
}, [currentQuestion, currentModule, submissionId])
// Fires immediately on EVERY question change
```

### SQL Generated (per navigation — no debounce)

```sql
-- Fires on every Next/Back click

-- Step 1: verify submission ownership
SELECT id, status
FROM submissions
WHERE id         = 'sub-uuid-123'
  AND student_id = 'user-uuid-456';

-- Step 2: write progress bookmark
UPDATE submissions
SET    current_question_id = 'q-uuid-022',
       current_module      = 'Math Module 1',
       updated_at          = NOW()
WHERE  id = 'sub-uuid-123';
-- Rapid clicking: 44 of these writes in a few seconds
```

### Fix — Debounce the progress write

```ts
// ✅ Fixed — only writes after student pauses 1.5 seconds on a question
const progressTimer = useRef<NodeJS.Timeout | null>(null)

useEffect(() => {
  if (!currentQuestion) return

  if (progressTimer.current) clearTimeout(progressTimer.current)

  progressTimer.current = setTimeout(() => {
    fetch(progressEndpoint ?? `/api/submissions/${submissionId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        current_question_id: currentQuestion.questionId,
        current_module:      currentModule,
      }),
    }).catch(() => undefined)
  }, 1500)

  return () => {
    if (progressTimer.current) clearTimeout(progressTimer.current)
  }
}, [currentQuestion, currentModule, submissionId])
// Rapid clicking through 44 questions → 0 DB writes
// Settling on a question for 1.5s → 1 DB write
```

### Fixed SQL

```sql
-- Only fires if student pauses ≥ 1.5 seconds on a question
-- Rapid back-and-forth navigation = 0 DB writes
UPDATE submissions
SET    current_question_id = 'q-uuid-022',
       current_module      = 'Math Module 1',
       updated_at          = NOW()
WHERE  id = 'sub-uuid-123';
```

---

## 🟡 Case 6 — No Pagination on Exam Papers

**File:** `app/api/exam-papers/route.ts` · line 22

### Problem

The GET handler returns every non-archived exam paper with no LIMIT.
Payload size and query time grow linearly with the number of papers created.

```ts
// ❌ Current code — no limit
supabase
  .from('exam_papers')
  .select('id, title, source, year, description, is_public, created_by, created_at')
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  // No .limit()
```

### SQL Generated

```sql
SELECT id, title, source, year, description, is_public, created_by, created_at
FROM exam_papers
WHERE archived_at IS NULL
ORDER BY created_at DESC;
-- No LIMIT — returns every paper ever created
```

### Fix — Add limit, add keyset cursor for pagination

```ts
// ✅ Fixed — paginated with keyset cursor (same pattern as /api/questions)
const afterCreatedAt = searchParams.get('after_created_at')
const afterId        = searchParams.get('after_id')
const PAGE_SIZE      = 50

let query = supabase
  .from('exam_papers')
  .select('id, title, source, year, description, is_public, created_by, created_at')
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  .order('id',         { ascending: false })
  .limit(PAGE_SIZE + 1)

if (afterCreatedAt && afterId) {
  query = query.or(
    `created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`
  )
}

const { data, error } = await query
const hasNext = (data ?? []).length > PAGE_SIZE
const page    = (data ?? []).slice(0, PAGE_SIZE)
```

### Fixed SQL

```sql
-- First page
SELECT id, title, source, year, description, is_public, created_by, created_at
FROM exam_papers
WHERE archived_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 51;  -- fetch one extra to know if there is a next page

-- Subsequent pages (keyset cursor — no OFFSET, no skipped rows)
SELECT id, title, source, year, description, is_public, created_by, created_at
FROM exam_papers
WHERE archived_at IS NULL
  AND (
    created_at < '2025-05-01T00:00:00Z'
    OR (created_at = '2025-05-01T00:00:00Z' AND id < 'uuid-cursor')
  )
ORDER BY created_at DESC, id DESC
LIMIT 51;
```

---

## 🟡 Case 7 — Two Sequential Queries for Tag Filtering

**File:** `app/api/questions/route.ts` · lines 52–61

### Problem

When a tag filter is active, the route runs two sequential queries:
first to get all matching question IDs, then a second query with those IDs
in an `IN` clause. With thousands of tagged questions the `IN` list becomes huge.

```ts
// ❌ Current code — 2 sequential queries
let taggedIds: string[] | null = null
if (tagId) {
  // Query 1: get all question IDs with this tag
  const { data: rows } = await supabase
    .from('question_tags')
    .select('question_id')
    .eq('tag_id', tagId)
  taggedIds = rows.map(r => r.question_id)
}

// Query 2: main query using those IDs as IN list
if (taggedIds) query = query.in('id', taggedIds)
```

### SQL Generated (sequential)

```sql
-- Query 1: get all question IDs with this tag
SELECT question_id
FROM question_tags
WHERE tag_id = 'tag-uuid-math-algebra';
-- Returns e.g. 600 rows

-- Query 2: starts only after query 1 finishes
-- The IN list can have hundreds of UUIDs — expensive to parse and plan
SELECT id, type, content, difficulty, created_at
FROM questions
WHERE id IN (
  'q-001', 'q-002', 'q-003', ..., 'q-600'   -- 600 UUIDs
)
  AND archived_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 21;
```

### Fix — Single query with inner join

```ts
// ✅ Fixed — one query using inner join
if (tagId) {
  query = supabase
    .from('questions')
    .select('id, type, content, difficulty, created_at, question_tags!inner(tags(id, name, subject))')
    .is('archived_at', null)
    .eq('question_tags.tag_id', tagId)   // filter on the joined table
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(PAGE_SIZE + 1)
} else {
  query = supabase
    .from('questions')
    .select('id, type, content, difficulty, created_at, question_tags(tags(id, name, subject))')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(PAGE_SIZE + 1)
}
```

### Fixed SQL

```sql
-- Single query — join replaces both sequential queries
SELECT
  q.id, q.type, q.content, q.difficulty, q.created_at,
  t.id   AS tag_id,
  t.name AS tag_name,
  t.subject
FROM questions q
JOIN question_tags qt ON qt.question_id = q.id   -- !inner = only questions that have this tag
JOIN tags t           ON t.id = qt.tag_id
WHERE qt.tag_id    = 'tag-uuid-math-algebra'
  AND q.archived_at IS NULL
ORDER BY q.created_at DESC, q.id DESC
LIMIT 21;
-- Postgres uses the index on question_tags(tag_id) directly — no large IN list
```

---

## 🟡 Case 8 — No LIMIT on Submissions List

**File:** `app/api/submissions/route.ts` · line 22

### Problem

The GET handler has no `.limit()`. For an assignment with 50 students
× 3 retakes = 150 rows returned with no ceiling.

```ts
// ❌ Current code — no limit
let query = supabase
  .from('submissions')
  .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
  .order('started_at', { ascending: false })

if (instanceId) query = query.eq('instance_id', instanceId)
if (studentId)  query = query.eq('student_id', studentId)
```

### SQL Generated

```sql
SELECT id, instance_id, student_id, attempt_number,
       status, raw_score, total_questions,
       started_at, submitted_at, time_spent_seconds
FROM submissions
WHERE instance_id = 'inst-uuid-123'
ORDER BY started_at DESC;
-- No LIMIT — returns every submission ever for this instance
```

### Fix — Add limit

```ts
// ✅ Fixed — reasonable ceiling
let query = supabase
  .from('submissions')
  .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
  .order('started_at', { ascending: false })
  .limit(200)   // hard ceiling; paginate if needed beyond this

if (instanceId) query = query.eq('instance_id', instanceId)
if (studentId)  query = query.eq('student_id', studentId)
```

### Fixed SQL

```sql
SELECT id, instance_id, student_id, attempt_number,
       status, raw_score, total_questions,
       started_at, submitted_at, time_spent_seconds
FROM submissions
WHERE instance_id = 'inst-uuid-123'
ORDER BY started_at DESC
LIMIT 200;
```

---

## 🟡 Case 9 — Sequential Queries on Free Test Load

**File:** `app/[locale]/free-test/test/[paperId]/page.tsx`

### Problem

The free test page runs up to 6 queries sequentially. Each waits for the
previous one to finish before starting, even when they are independent.

```ts
// ❌ Current code — sequential waterfall
const paper    = await raw.from('exam_papers').select(...)           // 1️⃣
const existing = await raw.from('public_exam_attempts').select(...)   // 2️⃣ waits for 1
if (!existing) {
  const count   = await raw.from('public_exam_attempts').select(...)  // 3️⃣ waits for 2
  const created = await raw.from('public_exam_attempts').insert(...)  // 4️⃣ waits for 3
}
const questions = await raw.from('exam_paper_questions').select(...)   // 5️⃣ waits for 4
const answers   = await raw.from('public_exam_answers').select(...)    // 6️⃣ waits for 5
```

### SQL Round-Trip Timeline (worst case — new attempt)

```
t=0ms   SELECT exam_paper WHERE id=$1 AND is_public=true ...
t=10ms  ← paper result

t=10ms  SELECT existing attempt WHERE status='in_progress' ...
t=20ms  ← no existing attempt

t=20ms  SELECT COUNT(*) FROM public_exam_attempts WHERE student_id=$1 ...
t=30ms  ← count = 2

t=30ms  INSERT INTO public_exam_attempts (attempt_number=3) ...
t=40ms  ← new attempt id

t=40ms  SELECT questions + options WHERE exam_paper_id=$1 ...
t=50ms  ← questions

t=50ms  SELECT answers WHERE attempt_id=$1 ...
t=60ms  ← answers

Total: ~60ms pure network latency (not counting query execution time)
```

### Fix — Parallelize independent queries

```ts
// ✅ Fixed — paper + existing attempt in parallel (independent of each other)
const [paperResult, existingResult] = await Promise.all([
  raw
    .from('exam_papers')
    .select('id, title')
    .eq('id', params.paperId)
    .eq('is_public', true)
    .is('archived_at', null)
    .single(),
  raw
    .from('public_exam_attempts')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('exam_paper_id', params.paperId)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
])

let attempt = existingResult.data
if (!attempt) {
  // count + insert must stay sequential (insert needs the count)
  const { count } = await raw
    .from('public_exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_paper_id', params.paperId)
    .eq('student_id', user.id)

  const { data: created } = await raw
    .from('public_exam_attempts')
    .insert({ exam_paper_id: params.paperId, student_id: user.id, attempt_number: (count ?? 0) + 1 })
    .select('id, status, started_at, current_question_id, current_module')
    .single()

  attempt = created
}

// ✅ questions + answers in parallel (both only need attempt.id, which is now known)
const [questionsResult, answersResult] = await Promise.all([
  raw
    .from('exam_paper_questions')
    .select('id, question_id, order_index, module_name, questions(id, type, content, question_options(id, label, content, order))')
    .eq('exam_paper_id', params.paperId)
    .order('module_name', { ascending: true })
    .order('order_index', { ascending: true }),
  raw
    .from('public_exam_answers')
    .select('question_id, selected_option_id, answer_text, is_marked_for_review, highlight_data, note_text, strikethrough_data, time_spent_seconds')
    .eq('attempt_id', attempt.id),
])
```

### Fixed SQL Round-Trip Timeline

```
t=0ms   SELECT exam_paper ...         SELECT existing attempt ...  (parallel)
t=10ms  ← paper result                ← attempt found (happy path: existing attempt)

t=10ms  SELECT questions + options ... SELECT answers ...           (parallel)
t=20ms  ← questions                   ← answers

Total: ~20ms instead of ~60ms (3× faster on cache hit)
```

---

## Implementation Priority

```
Week 1 — Critical (every student, every session)
  [ ] Case 1 — Queue worker for grading + atomic submit guard
  [ ] Case 3 — RLS policy replaces explicit ownership SELECT

Week 2 — High (teacher pages + test UX)
  [ ] Case 2 — Split 4-level join into 2 focused queries
  [ ] Case 4 — Lazy-load question detail in teacher assignment page
  [ ] Case 5 — Debounce progress PATCH (1.5s)

Week 3 — Medium (data growth protection)
  [ ] Case 6 — Paginate exam papers list
  [ ] Case 7 — Inner join replaces sequential tag filter queries
  [ ] Case 8 — Add LIMIT 200 to submissions GET
  [ ] Case 9 — Parallelize free test page queries
```

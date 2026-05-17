# SAT Platform Audit Handoff

> Created: 2026-05-17  
> Purpose: concise handoff for the next working session  
> Scope reviewed: product docs, schema/migrations, main Next.js app, API routes, tests, and separate SAT ETL pipeline

---

## Current Project Status

The project is best described as:

> **Working internal alpha with a strong schema and a functioning core loop, but not yet safe for real rollout because several business and security rules are not enforced end-to-end.**

### What already exists

- Admin / Teacher / Student areas
- Courses, classes, weeks, enrollments
- Question bank
- Manual question creation
- `.docx` parsing flow
- Assignments and assignment instances
- Student test-taking flow
- Raw score calculation
- Results page
- Error log
- Exam paper bank
- Separate Python ETL pipeline

### Verification completed

- `pnpm build` succeeds
- Jest suite passes: `36/36`

---

## Important Product Understanding

This is a **private Vietnamese SAT management platform** for one teacher and roughly 200 students, not a public SaaS app.

Core loop:

```text
Teacher uploads/creates questions
→ assigns them to a class
→ student takes a Bluebook-like test
→ student sees score
→ teacher reviews performance
→ wrong answers feed long-term error log
```

Key business rules from the docs:

1. One student = one active course at a time, one class within that course
2. Students use Google OAuth only
3. Score appears immediately after submit
4. Full review obeys `show_results`
5. Submitted answers become immutable
6. Error log is append-only
7. Retakes obey assignment settings
8. Tab-switch / cheating signals should be logged

---

## Highest-Priority Findings

### P0 — Service-role API routes bypass business authorization

Several routes authenticate a user, then use the Supabase service role client without checking whether the user is authorized for the target resource.

Examples:

- `app/api/courses/route.ts`
- `app/api/classes/route.ts`
- `app/api/profiles/[id]/route.ts`
- `app/api/submission-answers/route.ts`

Why this matters:

- RLS exists, but service-role writes bypass it
- some authenticated users can mutate records they should not control
- this is the most serious production risk in the codebase

### P0 — Submitted answers are not fully immutable

`app/api/submission-answers/route.ts` upserts with service role and does not verify:

- the submission belongs to the current user
- the submission is still `in_progress`

This conflicts with the documented rule that submitted answers must never be edited.

### P0 — Retake limits are not enforced

`max_retakes` exists in schema and UI, but the student test flow and `/api/submissions` can create additional attempts without checking the configured limit.

Relevant files:

- `app/(student)/student/test/[instanceId]/page.tsx`
- `app/api/submissions/route.ts`

### P0 — `show_results` is not enforced

The results page currently returns answer keys and review details immediately even when the assignment setting is `after_deadline`.

Relevant file:

- `app/(student)/student/test/[instanceId]/results/page.tsx`

---

## Newly Confirmed UI Bug: deleted items remain visible until refresh

### Symptom

After deleting / archiving a course, class, or question, the item may still appear on screen until the browser page is manually refreshed.

### Likely root cause

Most list screens are rendered as **Next.js Server Components**. After a mutation, the app does not consistently:

1. update the client-side list state, or
2. call `router.refresh()`, or
3. invalidate server-rendered data with `revalidatePath(...)`

So the database is updated, but the UI can keep showing stale data from the previous render.

### Evidence in current code

- Teacher course list is server-rendered:
  - `app/(teacher)/teacher/courses/page.tsx`
- Teacher course detail / class list is server-rendered:
  - `app/(teacher)/teacher/courses/[id]/page.tsx`
- Question bank list is server-rendered and receives `questions` as initial props:
  - `app/(teacher)/teacher/questions/page.tsx`
  - `app/(teacher)/teacher/questions/question-bank-client.tsx`
- Delete / archive API routes mutate records but do not revalidate affected paths:
  - `app/api/courses/[id]/route.ts`
  - `app/api/classes/[id]/route.ts`
  - `app/api/questions/[id]/route.ts`

### Recommended fix pattern

Use both where appropriate:

1. **Immediate local UI update**
   - remove the deleted item from local client state when the mutation succeeds
2. **Server data invalidation**
   - call `revalidatePath(...)` in mutation routes or server actions for affected pages
3. **Client refresh after navigation-sensitive mutations**
   - use `router.refresh()` when the current page depends on server-fetched data

### Concrete examples

- deleting a question:
  - remove it from the question bank client list immediately
  - revalidate `/teacher/questions`
- deleting a class:
  - revalidate `/teacher/courses/[courseId]`
- deleting a course:
  - revalidate `/teacher/courses`
  - revalidate related admin pages if they show course counts

### Priority

This should be treated as:

> **P1 — user-facing consistency bug**

It is not as dangerous as the auth / submission issues, but it causes distrust because the user cannot tell whether the delete succeeded.

---

## Other Confirmed Gaps / Bugs

### Test flow gaps

- short-answer questions are supported in backend but not actually usable in the current test UI
- “mark for review” is stored only in local flag state and is not correctly persisted
- `shuffle_questions` and `shuffle_options` exist but are not applied in the student test flow
- no real module flow
- no Desmos calculator
- no fullscreen enforcement
- no tab-switch logging
- no copy/paste prevention
- no per-question timing persistence

### Question import gaps

- `.docx` images are parsed but not yet uploaded to storage end-to-end
- AI tag suggestion currently returns `null`

### Product gaps

- device-session enforcement
- device violation monitoring UI
- notifications / deadline emails
- class library UI
- course expiration behavior in student views
- past-course read-only mode
- skill breakdown analytics
- detailed teacher review
- leaderboard
- export features
- student dashboard analytics

### Documentation drift

- `.docs/PLAN.md` is stale; many implemented items are still unchecked
- `.docs/PRODUCT-STUDENT.md` contradicts itself on student auth
- `.docs/DESIGN.md` appears unrelated to the SAT product

---

## Recommended Priority Order

### Phase 1 — Harden the foundation first

1. **Fix authorization on all service-role API routes**
   - enforce roles
   - enforce ownership
   - avoid service role where RLS is enough

2. **Protect submission integrity**
   - enforce ownership
   - reject writes after `submitted`
   - prevent late mutation of answers

3. **Enforce assignment rules**
   - `max_retakes`
   - deadline checks
   - `show_results`

4. **Fix stale UI after delete / archive mutations**
   - local state update
   - `router.refresh()`
   - `revalidatePath(...)`

5. **Add tests around the above**
   - unauthorized mutations
   - retake limit
   - review gating
   - delete/refresh behavior
   - submission immutability

### Phase 2 — Finish the real core product loop

6. Complete the student test interface
   - short answer input
   - persisted mark-for-review
   - shuffle
   - resume behavior
   - deadline lock UX

7. Finish result and error-log correctness
   - hidden review before deadline
   - time-per-question
   - assignment / skill filters
   - error log redo flow

8. Finish import workflow
   - image upload from `.docx`
   - dedup UX polish
   - AI tag suggestion only after the rest is reliable

### Phase 3 — Product completeness

9. Device/session controls and cheating signals
10. Notifications and class library
11. Teacher analytics and exports
12. Student analytics / Phase 2 features

---

## Suggested First Sprint

If only one sprint is available, do this:

1. audit every route that uses `SUPABASE_SERVICE_ROLE_KEY`
2. add explicit role / ownership checks
3. fix `/api/submission-answers`
4. enforce `max_retakes`
5. enforce `show_results`
6. fix stale delete UI with revalidation + refresh
7. add regression tests for all six items

That sprint would materially improve both safety and user trust more than adding any new feature.

---

## Files Most Worth Opening First in the Next Session

- `app/api/submission-answers/route.ts`
- `app/api/submissions/route.ts`
- `app/(student)/student/test/[instanceId]/page.tsx`
- `app/(student)/student/test/[instanceId]/results/page.tsx`
- `app/api/courses/route.ts`
- `app/api/classes/route.ts`
- `app/api/profiles/[id]/route.ts`
- `app/api/courses/[id]/route.ts`
- `app/api/classes/[id]/route.ts`
- `app/api/questions/[id]/route.ts`
- `app/(teacher)/teacher/courses/page.tsx`
- `app/(teacher)/teacher/courses/[id]/page.tsx`
- `app/(teacher)/teacher/questions/page.tsx`


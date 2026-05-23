# SAT Exam Management Platform — Project Status Report
**Date**: 2026-05-23  
**Branch**: `main`  
**Git User**: nghilethanh09052000

---

## Executive Summary

The platform is a **working internal alpha** for a Vietnamese SAT prep school (~1 teacher, ~200 students). The core loop is complete: teacher uploads questions → assigns to classes → students take Bluebook-style tests → results logged. Infrastructure is solid (Next.js 14, Supabase, Vercel Queue, full RLS), but several P0 business logic and security gaps exist that must be resolved before scaling to real students.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 14.2.35 |
| UI | Tailwind CSS, React 18 | — |
| Language | TypeScript (strict) | 5 |
| i18n | next-intl (EN + VI) | 4.12.0 |
| Database | Supabase (PostgreSQL + RLS) | — |
| AI | Anthropic Claude SDK | 0.95.1 |
| Math | KaTeX + react-katex | 0.16.45 |
| File Parsing | Mammoth.js (.docx), pdf-parse | 1.12.0 |
| Background Jobs | Vercel Queue v2 beta | 0.2.0 |
| Email | Resend (configured, unused) | 6.12.3 |
| Testing | Jest (unit) + Playwright (E2E) | — |
| Deployment | Vercel + Supabase Cloud | — |
| Orchestration | Temporal (pipeline only) | — |
| Analytics DB | ClickHouse (pipeline only) | — |

---

## Feature Completion Status

### Admin Dashboard
| Feature | Status | Notes |
|---|---|---|
| Student list + CSV import | ✅ Done | |
| User management (admin/teacher accounts) | ✅ Done | |
| Course overview | ✅ Done | |
| Device session monitor + clear | ✅ Done | |
| Question import tracking | ✅ Done | |
| Summary dashboard (stats, leaderboard) | ✅ Done | |
| Audit/activity log | ❌ Missing | No admin action logging at all |
| System settings page | ❌ Missing | Schema doesn't exist |
| Course expiration workflow | ❌ Missing | `expires_at` stored, no UI/enforcement |
| Admin inbox for student reports | ❌ Missing | Schema exists, no UI |
| Operational visibility for import failures | ❌ Missing | Queue errors not surfaced in UI |

### Teacher Dashboard
| Feature | Status | Notes |
|---|---|---|
| Course / Class / Week CRUD | ✅ Done | |
| Question bank (create, edit, search) | ✅ Done | |
| .docx upload + AI tagging | ✅ Done | |
| Duplicate detection on upload | ✅ Done | content_hash comparison |
| Assignment creation wizard | ✅ Done | |
| Assignment instances (schedule + publish) | ✅ Done | |
| Submission scores per student | ✅ Done | |
| Exam papers (Ngân Hàng Đề Thi) | ✅ Done | |
| Student enrollment (manual + CSV) | ✅ Done | |
| Assignment editing / duplication | ❌ Missing | Create-only, no edit |
| Class library UI | ❌ Missing | Schema exists (`class_library_folders`, `class_library_files`), no UI |
| Deadline email alerts | ❌ Missing | Resend configured but no email flows |
| Rich analytics / export | ❌ Missing | No charts, no CSV export of results |
| Settings page | ❌ Placeholder | Page exists but empty |

### Student Dashboard
| Feature | Status | Notes |
|---|---|---|
| Course + assignment view | ✅ Done | Active vs review-mode separated |
| Bluebook test interface | ✅ Done | Full-screen, timed, module-based |
| Autosave (answers, notes, highlights) | ✅ Done | Every 2 seconds |
| Test navigation + status indicators | ✅ Done | |
| Results page (score) | ✅ Done | |
| Error log (wrong answers + notes) | ✅ Done | |
| One-device login enforcement | ✅ Done | `device_sessions` table |
| Timer + auto-submit on timeout | ⚠️ Partial | Timer exists, auto-submit not confirmed complete |
| Shuffle questions/options | ⚠️ Partial | Flags stored in DB, **not applied in test rendering** |
| show_results gating (review visibility) | ❌ Bug | Results page shows full review regardless of setting |
| Retake limit enforcement | ❌ Bug | `max_retakes` stored, **never checked** before creating new attempt |
| Report-a-question flow | ❌ Missing | Schema exists, no UI |
| Tab-switch / blur event persistence | ❌ Missing | Events captured but not saved to DB |
| Past course expiration behavior | ❌ Needs QA | Unverified |

### Free Test (Public / Unapproved Students)
| Feature | Status | Notes |
|---|---|---|
| Public test URL | ✅ Done | |
| Bluebook UI (same as student) | ✅ Done | |
| Score shown after submit | ✅ Done | |
| Enrollment tracking | ❌ By design | No tracking, trial-only |

---

## Known Bugs

### P0 — Security / Data Integrity

**1. Service-Role Authorization Bypass**  
Most API routes authenticate the user but then switch to a **service-role Supabase client** for DB operations, bypassing RLS entirely. There are no ownership checks before mutations.  
- Affected routes: `/api/courses/`, `/api/classes/`, `/api/profiles/[id]/`, `/api/submission-answers/`, and more  
- Impact: Any authenticated user can read/modify resources they don't own  
- Fix: Validate that the authenticated user owns the target resource before every service-role mutation

**2. Submitted Answers Are Mutable**  
`/api/submission-answers/route.ts` upserts answers without checking whether the parent submission is still `in_progress`.  
- Impact: Students can modify answers on a submitted test  
- Fix: Validate `submissions.status = 'in_progress'` before allowing any answer upsert

**3. Retake Limits Not Enforced**  
`assignment_instances.max_retakes` exists in the schema but is never read before a new submission attempt is created.  
- Affected: `/api/submissions/route.ts`, student test page  
- Impact: Students can exceed the configured max retakes  
- Fix: Check attempt count against `max_retakes` inside `create_submission_attempt` RPC or the API route

**4. `show_results` Not Enforced**  
The results page displays full question review regardless of `assignment_instances.show_results`.  
- Affected: `app/(student)/student/test/[instanceId]/results/page.tsx`  
- Impact: Students see answers when the teacher intended to hide them  
- Fix: Gate full review behind `show_results = true` check on results page

### P1 — Functional Bugs

**5. Stale Data in List UIs**  
Deleted courses, classes, questions remain visible until a hard refresh. Next.js Server Component cache is not invalidated after mutations.  
- Affected: All list pages (courses, classes, questions, assignments)  
- Fix: Call `revalidatePath()` or `revalidateTag()` after every create/update/delete API call

**6. Shuffle Flags Stored but Not Applied**  
`assignments.is_shuffle_questions` and `is_shuffle_options` are saved but the test rendering ignores them.  
- Affected: `app/(student)/student/test/[instanceId]/page.tsx`  
- Fix: Apply Fisher-Yates shuffle to question/option arrays when loading the test, seeded per-submission to be deterministic on refresh

**7. Unit Test Stale Expectations**  
`__tests__/utils/submission-rules.test.ts` expects old retry semantics that no longer match the current implementation. CI passes only because of `passWithNoTests` — the test itself likely fails in isolation.  
- Fix: Update test expectations to match current `max_retakes` and submission-rules logic

**8. Timer Auto-Submit Not Confirmed**  
The countdown timer is rendered but it is unclear whether it triggers automatic test submission when it reaches 0.  
- Risk: Students running out of time may not have their answers submitted  
- Action: Manual QA needed on the timer expiry path

---

## Potential Future Bugs

### Race Conditions

**RC-1. Concurrent Answer Autosave**  
Autosave fires every 2 seconds. If network is slow, two concurrent upsert requests for the same `(submission_id, question_id)` pair could arrive out of order, potentially overwriting a newer answer with an older one.  
- Mitigation: Add a `client_timestamp` column to `submission_answers` and only upsert if incoming timestamp > stored timestamp

**RC-2. Double Submission**  
If a student clicks "Submit" and the network is slow, double-clicking or a retry could create two `submit` calls, potentially double-scoring.  
- Mitigation: Add a database-level unique constraint or optimistic lock on `submissions.status` transition (in_progress → submitted is idempotent via the existing RPC, but worth verifying)

**RC-3. Queue Job Re-entrancy**  
Vercel Queue retries jobs on failure. If a `question-import` job partially inserts questions and then fails, a retry could insert duplicates (the `content_hash` dedup only helps at the question level, not partial batch).  
- Mitigation: Wrap the import batch in a database transaction; use idempotency keys on the queue payload

### Scalability

**SC-1. KaTeX Rendering on Large Question Sets**  
If an assignment has 50+ math-heavy questions, client-side KaTeX rendering could cause jank on lower-end devices. No Lighthouse budget is enforced for this.

**SC-2. .docx Parser Memory Spike**  
Mammoth.js loads the entire .docx into memory synchronously. A 10 MB .docx file with many embedded images could spike the Vercel function memory limit.  
- Mitigation: Enforce a file size limit on the upload endpoint (currently unchecked)

**SC-3. Supabase RLS Policy Complexity**  
14 migration files are dedicated to RLS policies. As the schema grows, policy interactions become harder to reason about. An incorrectly written policy could silently deny access to legitimate users.  
- Mitigation: Add RLS integration tests to CI (currently there's only a smoke test)

### Business Logic

**BL-1. Enrollment Expiry Not Enforced**  
`courses.expires_at` is stored but nothing in middleware or the student dashboard actively blocks access after expiry. Students may access expired courses indefinitely.

**BL-2. `archived_at` Soft Deletes Inconsistent**  
Some list queries filter `WHERE archived_at IS NULL`, others do not. If a question or assignment is archived, it may still appear in some lists and be hidden in others.

**BL-3. One-Device Limit Edge Case**  
If a student's browser crashes without triggering the session cleanup, `device_sessions` may retain a stale session. The student would be locked out of their own account until an admin manually clears the session.  
- Mitigation: Add session TTL (e.g., auto-expire device sessions after 24 hours of inactivity)

**BL-4. Unapproved Student Can Access Student Routes**  
If an unapproved student somehow obtains a valid enrolled session (e.g., role set manually in DB), middleware role-caching may serve stale role data and allow access.

**BL-5. Question Content Hash Collision**  
`content_hash` for duplicate detection uses a hash of question content. If the hash function produces a collision on two genuinely different questions, one will be silently rejected as a duplicate.

### Infrastructure

**IN-1. Python Pipeline Scraper Fragility**  
The Temporal pipeline scrapes `bluebooky.com` and `satgpt.xyz` using Playwright selectors. Any change to these sites' HTML structure will silently break the scraper without alerting anyone.

**IN-2. No Staging Environment**  
All `main` pushes deploy directly to production. A breaking migration or bad deploy will immediately affect real students.  
- Mitigation: Create a Supabase branch + Vercel preview environment for pre-production testing

**IN-3. Vercel Queue v2 is Beta**  
`@vercel/queue@0.2.0` is a beta product. Breaking API changes in future versions could silently break background imports.

**IN-4. Missing File Size Validation on Uploads**  
Neither the .docx upload nor the student CSV import validates file size before processing. A maliciously large file could exhaust Vercel function memory or timeout.

---

## Missing Infrastructure

| Item | Priority | Notes |
|---|---|---|
| Staging environment | High | No preview before prod deploy |
| Email flows (deadline alerts, welcome) | High | Resend configured but unused |
| Audit log | High | No record of admin/teacher actions |
| Operational alerts (queue failures) | High | Errors silent in prod |
| File size validation on upload endpoints | High | Memory/timeout risk |
| Session TTL on `device_sessions` | Medium | Prevents permanent lockout |
| RLS integration tests in CI | Medium | Only smoke test currently |
| Load testing in CI | Medium | Manual autocannon script only |
| Analytics / reporting | Medium | No charts, no CSV exports |
| Admin inbox for student reports | Low | Schema ready |

---

## API Routes Overview (48 routes)

| Group | Routes | Auth Model |
|---|---|---|
| Auth + Profiles | `/api/auth/callback`, `/api/profiles/` | Session-based |
| Courses / Classes / Weeks | 9 CRUD routes | Service-role (⚠️ no ownership check) |
| Students + Enrollments | 6 routes | Service-role (⚠️ no ownership check) |
| Questions | 8 routes | Service-role (⚠️ no ownership check) |
| Assignments + Instances | 6 CRUD routes | Service-role (⚠️ no ownership check) |
| Submissions + Answers | 5 routes | Service-role (⚠️ no ownership check) |
| Exam Papers | 4 CRUD routes | Service-role (⚠️ no ownership check) |
| Device Sessions | 1 route | Service-role |
| Error Log | 2 routes | Service-role |
| Vercel Queue Handlers | 3 routes | OIDC (Vercel) |
| Free Test (public) | 4 routes | No auth |
| Admin Utilities | 4 routes | Service-role |

---

## Database Overview (25 tables)

| Category | Tables |
|---|---|
| Users | `profiles`, `device_sessions` |
| Course Structure | `courses`, `classes`, `weeks`, `enrollments` |
| Question Bank | `questions`, `question_options`, `question_accepted_answers`, `tags`, `question_tags` |
| Assignments | `assignments`, `assignment_questions`, `assignment_instances` |
| Test Taking | `submissions`, `submission_answers` |
| Logging | `error_log`, `tab_switch_events` |
| Exam Papers | `exam_papers`, `exam_paper_questions` |
| Library (Unbuilt) | `class_library_folders`, `class_library_files` |
| Notifications (Unbuilt) | `notifications` |
| Imports | `question_imports` |

---

## Test Coverage

| Type | Status | Count |
|---|---|---|
| Unit (Jest) | ⚠️ Partial | 9 test files, 36 tests; 1 file has stale expectations |
| E2E (Playwright) | ⚠️ Partial | 3 specs (auth, student-home, teacher-courses) |
| Lighthouse / Performance | ⚠️ Config only | Not enforced in CI |
| Load testing | ⚠️ Manual only | autocannon script, not in CI |
| RLS smoke test | ⚠️ Basic | SQL assertions in CI, not comprehensive |

---

## Priority Action Plan

### P0 — Fix Before Real Students Use the App
1. Add ownership authorization checks to all service-role API routes
2. Enforce submission immutability (check `status = 'in_progress'` before answer upsert)
3. Enforce `max_retakes` before creating a new submission attempt
4. Gate results review page behind `show_results` setting
5. Validate and limit file sizes on all upload endpoints

### P1 — Fix Soon After
6. Fix stale-data UI bug (`revalidatePath` after mutations)
7. Apply shuffle flags in test rendering
8. Confirm and QA timer auto-submit on expiry
9. Add session TTL to `device_sessions` (prevent permanent lockout)
10. Update stale unit test expectations

### P2 — Feature Completion
11. Build class library UI
12. Implement report-a-question flow
13. Wire up Resend email for deadline alerts and welcome emails
14. Implement course expiration enforcement
15. Add admin audit log
16. Add assignment editing / duplication

### P3 — Operations & Scale
17. Create staging environment (Supabase branch + Vercel preview)
18. Surface queue failure alerts in admin UI
19. Add RLS integration tests to CI
20. Add load testing to CI pipeline
21. Clarify and harden Python pipeline production deployment

---

## Background Pipeline (Python)

The `pipeline/sat-pipeline/` directory contains a separate ETL system using **Temporal orchestration**:

- Scrapes SAT questions from `bluebooky.com` + `satgpt.xyz` via Playwright
- Stores raw data in **ClickHouse** (append-only)
- Transforms via **dbt-clickhouse** models
- Syncs cleaned questions to the main PostgreSQL DB

**Status**: Scaffold implemented, output JSON files exist locally, **not integrated into production**. The scraper is fragile (HTML selector-dependent) and has no monitoring. Production deployment plan is unclear.

---

## CI/CD Summary

**GitHub Actions** (`ci.yml`) runs on every push to `main` and PRs:
- Secret scan, YAML lint, ESLint, TypeScript check
- Jest unit tests
- Next.js build check
- Playwright E2E
- Supabase migration compile + schema drift check
- RLS smoke test (SQL assertions)
- Python pipeline lint (Ruff + pytest)
- On `main` push: deploy migrations to Supabase Cloud + Telegram notification

**Gap**: No staging environment — `main` deploys directly to production.

---

*Report generated by Claude Code on 2026-05-23. Source: full static analysis of the repository at `/Users/nghilethanh/Project/OTHER-SAT-Exam-Management-Platform`.*

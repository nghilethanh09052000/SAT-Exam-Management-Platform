# Current App State And Potential Risks

Last updated: 2026-05-19

## High-Level State

This is a Next.js 14 app for a SAT exam management platform using Supabase for auth, database access, and role-based routing.

The app currently has three main user areas:

- **Student**: dashboard, assignment/test entry, Bluebook-style exam UI, result review/retry flow, and error log.
- **Teacher**: courses, classes, assignments, exam papers, question bank, DOCX/question upload, and student-facing content management.
- **Admin**: system dashboard, students, courses, users, quick actions, recent students, and smaller leaderboard widgets.

Authentication is centralized through `/login`.

- Students use Google login.
- Teachers/admins use internal email/password login.
- Middleware protects `/student`, `/teacher`, and `/admin` routes based on `profiles.role`.
- Disabled accounts redirect back to login with an account-disabled error.

## Recent UI And Product State

### Branding

Visible branding has been renamed from `SAT Platform` to `GD SAT Platform` in the login page, student sidebar, shared sidebar, and admin dashboard subtitle.

### Login

The login page now uses softer welcome/cham-ngon style copy instead of the previous role-explanation content.

Current tone:

- Welcomes the user back.
- Encourages steady SAT progress.
- Keeps the student/staff login choices intact.

### Student Dashboard

The student area now uses a colorful sidebar layout instead of a plain top-nav style.

Current sidebar behavior:

- `Bảng điều khiển` navigates to `/student`.
- `Bài kiểm tra` links to the assignment/test area on the student dashboard.
- `Sổ tay lỗi sai` navigates to `/student/error-log`.
- `Lịch học` and `Thành tích` currently show a "coming soon" toast message instead of navigating.

The active sidebar item uses a colorful blue/violet gradient with a black border, matching the newer requested style.

### Student Error Log

The error log page has been restyled with:

- Gradient background.
- Colorful filter panel.
- Larger, glassy question cards.
- Status badges.
- Personal note input.
- Redo-question link.

### Student Exam UI

The exam page has been redesigned toward a Bluebook-style experience while fitting inside the student layout.

Current exam features:

- Contained exam shell instead of full-screen overlay.
- Top timer and exam toolbar.
- Bluebook-like striped separators.
- Split-pane layout for directions/questions.
- Bottom question navigation popup.
- Back/Next controls.
- Mark for Review UI.
- Short-answer input preview.
- Calculator, Report, Reference, and More toolbar interactions.

The calculator currently opens a floating Desmos-style panel using a Desmos iframe.

The reference panel currently uses locally rendered formula diagrams.

The report modal currently collects text in the UI and shows a success alert, but does not appear to persist reports to the database yet.

### Student Results And Retry

The results page now computes retry availability using assignment attempt rules.

Current rule:

- `max_attempts = max_retakes + 1`
- Retry is available if the deadline has not passed and the student has not used all attempts.
- In-progress attempts can be continued.

The result action shows attempt usage such as `Đã dùng X/Y lần làm`.

### Admin Dashboard

The admin dashboard has been reorganized:

- `Học sinh mới đăng ký` was moved higher on the page.
- Leaderboards were made smaller.
- Summary stat cards and quick actions remain at the top.

## Architecture Notes

### Main Framework

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- Supabase SSR/client helpers.

### Important Utilities

- `lib/utils/submission-rules.ts`
  - `getMaxAttempts(maxRetakes)`
  - `canCreateAttempt(attemptCount, maxRetakes)`
  - `canRevealReview(showResults, deadline)`

- `middleware.ts`
  - Refreshes Supabase session.
  - Blocks unauthenticated app routes.
  - Uses service-role Supabase client to fetch `profiles.role` and `profiles.is_active`.

### Build State

Latest verified command:

```bash
pnpm exec next build
```

Result: passing.

## Potential Bugs And Risks

### 1. "Khoa Hoc" Student Tab Is Ambiguous

The student sidebar does not currently have a separate `Khóa học` item. The closest existing item is `Bài kiểm tra`.

Risk:

- If the product expects a dedicated `Khóa học` page/tab, users may not find it.
- The current "coming soon" change only applies to `Lịch học` and `Thành tích`, not a separate `Khóa học` item.

Suggested next step:

- Decide whether `Khóa học` should be a new sidebar item, or whether `Bài kiểm tra` is the intended course/test entry.

### 2. Coming-Soon Items Are UI-Only

`Lịch học` and `Thành tích` show a toast-like message, but they do not have real placeholder pages.

Risk:

- Direct URLs such as `/student/schedule` or `/student/achievements` do not exist.
- Users cannot bookmark or share coming-soon pages.

Suggested next step:

- Add lightweight placeholder routes if these sections are part of the near-term navigation plan.

### 3. Report Modal Does Not Persist Yet

The exam report modal currently accepts text and confirms submission in the UI.

Risk:

- Students may think reports are sent to teachers/admins when they are not stored.
- No admin/teacher report inbox exists yet.

Suggested next step:

- Add a `question_reports` table/API and persist current test/question context with report text.

### 4. Calculator Depends On External Desmos Embed

The calculator panel uses an external Desmos iframe.

Risk:

- It may fail if network access is blocked.
- It may be affected by iframe/CSP restrictions.
- It may not behave consistently in locked-down exam environments.

Suggested next step:

- Decide whether to keep Desmos, embed an official approved calculator flow, or provide a fallback calculator.

### 5. Exam Layout May Still Overflow On Smaller Screens

The exam shell was made smaller to fit inside the student layout, but it still has a relatively tall contained layout and a split-pane interface.

Risk:

- Small laptop heights or browser zoom above 100% may still cause vertical clipping.
- The sidebar reduces available width for the exam.
- Some long math content or tables may overflow inside question panes.

Suggested next step:

- Test at common sizes: 1366x768, 1440x900, 1920x1080, and mobile/tablet widths.
- Add Playwright visual checks for exam pages with long directions and long answer choices.

### 6. Retry Logic Depends On `max_retakes` Semantics

Current rule treats `max_retakes = 2` as `3 total attempts`.

Risk:

- If admins understand "2 attempts" as total attempts instead of retries, students may receive one extra try.

Suggested next step:

- Rename admin label/copy to clearly say either `Số lần làm lại` or `Tổng số lần làm`.
- Add tests for `max_retakes = 0`, `1`, and `2`.

### 7. Duplicate Attempt Race Condition

Retry/continue logic depends on counting existing attempts.

Risk:

- Fast double-clicks or multiple tabs could create duplicate attempts if the API does not enforce the limit transactionally.

Suggested next step:

- Enforce attempt limits inside the submission creation API/database layer, not only in the UI.

### 8. API Route Authorization May Be Uneven

Middleware requires a logged-in user for API routes, but deeper role/ownership checks are route-specific.

Risk:

- A logged-in user might hit an API endpoint that does not fully verify ownership or role.

Suggested next step:

- Audit all `app/api/**/route.ts` handlers for role checks, ownership checks, and RLS assumptions.

### 9. Middleware Uses Service Role During Edge Requests

Middleware creates a Supabase service-role client to read profile role/status.

Risk:

- If `SUPABASE_SERVICE_ROLE_KEY` is missing in deployment, protected routing may fail.
- Service-role use in middleware should be treated carefully because it bypasses RLS.

Suggested next step:

- Confirm environment variables in production.
- Add graceful failure behavior if profile lookup fails.

### 10. Student Error Log Data Scope Needs Verification

The error log UI is now richer, but the underlying data scope should be checked.

Risk:

- It may show incomplete data if only submitted answers are considered.
- It may not distinguish between wrong, skipped, partially correct, or unreviewable answers.

Suggested next step:

- Verify the query against expected SAT review behavior and add filters for wrong/skipped if needed.

### 11. Visual Changes Are Not Covered By Automated Tests

The app currently passes production build, but visual behavior has been changed substantially.

Risk:

- Regressions in sidebar active states, exam panels, dropdowns, and responsive layout may not be caught by build.

Suggested next step:

- Add Playwright smoke tests for:
  - Login page renders.
  - Student sidebar navigation states.
  - Error log page renders.
  - Exam toolbar opens calculator/report/reference/more.
  - Results page shows retry when attempts remain.

### 12. Untracked `.claude/worktrees/`

`git status --short` currently shows:

```text
?? .claude/worktrees/
```

Risk:

- This may be local tooling state and should not accidentally be committed.

Suggested next step:

- Decide whether `.claude/` should be gitignored.

## Recommended Next Priorities

1. Persist exam reports and add a teacher/admin review surface.
2. Confirm the `max_retakes` product meaning and add unit tests for attempt rules.
3. Add placeholder pages or remove inactive navigation for coming-soon sections.
4. Run responsive visual QA on student exam pages.
5. Audit API routes for role and ownership checks.
6. Add Playwright smoke coverage for the recent UI flows.


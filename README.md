# SAT Management Platform

A Vietnamese SAT preparation management platform for a teaching team and their students. Staff manage courses, classes, a shared question bank, assignments, and full Bluebook-style practice tests. Students take timed SAT tests, drill weak skills, review mistakes, and track progress. Includes a built-in AI assistant for staff, an AI-assisted question importer (.docx / .pdf), and a public marketing landing page.

> Not a public SaaS. Built for one school / teaching team, privately deployed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Deployment | Vercel |
| Styling | Tailwind CSS |
| i18n | next-intl (English + Vietnamese, locale-prefixed routes) |
| Math rendering | KaTeX / react-katex |
| Rich text | TipTap |
| Word/PDF parsing | Mammoth.js, pdf-parse, pdf-lib |
| Spreadsheets | SheetJS (xlsx) |
| Background jobs | Vercel Queues |
| Email | Resend |
| AI | Anthropic Claude API (+ OpenAI SDK), MCP server for the staff assistant |
| Validation | Zod |
| Testing | Jest + Testing Library, Playwright (e2e + perf), Lighthouse CI |

---

## Implemented Features

### Authentication, Roles & Permissions
- Supabase Auth with three base roles: **Admin**, **Teacher** (staff), **Student**.
- Students sign in via Google OAuth; staff use email/password via a hidden staff portal.
- Middleware (`middleware.ts`) gates routes by role and preserves Supabase auth cookies through redirects.
- **RBAC permission layer** (`lib/permissions.ts`, migration `20260613000000_rbac_permissions.sql`): admins have full god-mode access; staff are granted granular permissions (`materials:*`, `students:*`, `classes:*`, `grading:*`, `performance:view`) optionally scoped to specific classes via `staff_class_assignments`. Admin UI for editing per-user grants.
- Device-session limiting + device violation logging for students.

### Question Bank & Import
- Manual question authoring (multiple choice + student-produced/short-answer), KaTeX math, rich text, images.
- Subject + skill tagging, difficulty, stimulus/prompt support, full-text + relevance search.
- **AI-assisted import** of `.docx` and `.pdf` files: parses questions, extracts images to Supabase Storage, suggests tags, with content-hash dedup. Bulk review-and-save flow.
- AI-generated per-question explanations (cached, generated once per question).
- Imports run as **background jobs** via Vercel Queues (`question-import`, `student-import`, `grade-submission`).

### Courses, Classes & Enrollment
- Courses → Classes → Weeks hierarchy.
- Manual enrollment plus Excel/spreadsheet bulk student import.
- Bulk enrollment operations.

### Assignments & Exam Papers
- Build assignments from the question bank; assign to a class/week as instances.
- Per-instance settings, deadlines, and **deadline extensions** (`assignment-extensions`).
- Duplicate-instance prevention.
- **Exam Papers** as a distinct authoring + assignment surface.

### SAT Practice Tests (Bluebook-style)
- First-class multi-module SAT practice tests (separate from regular assignments).
- Full-screen test interface with countdown timer, question navigation, mark-for-review, and module flow.
- Autosave / checkpoint-and-resume via RPCs (`exam_autosave_rpcs`).
- Assignable to students; attempts tracked separately (`practice-test-assignments`, `practice-test-attempts`).

### Student Learning Hub
- Split navigation: **Practice** (tag/topic drills) and **Coursework** (assignments) hubs.
- Topic drills by skill tag, recorded via `record_practice_completion` RPC.
- **Error Log** — append-only collection of wrong answers with personal notes and redo.
- **Confidence** tracking and a personal **streak** counter.
- Results & review pages with skill breakdowns.

### Analytics & Grading
- Teacher analytics dashboard.
- Per-class score views and per-student review.
- Configurable **performance thresholds**.
- Submission grading (auto for objective items, including numeric-equivalence for math grid-ins).

### Trợ lý AI — Staff AI Assistant
- In-app conversational assistant for teachers and admins.
- Backed by an **MCP server** (`mcp/`) exposing platform domain tools (questions, exams, students, classes, analytics).
- Action confirmation flow + assistant audit logging.

### Public Landing & Localization
- Public marketing landing page at `/` (navy theme, Be Vietnam Pro font).
- Full English/Vietnamese localization with locale-prefixed routes (`/en/...`, `/vi/...`).

---

## Project Structure

```
app/
├── [locale]/
│   ├── page.tsx              # Public landing page
│   ├── (auth)/               # login + hidden staff portal
│   ├── (admin)/admin/        # users/RBAC, students, courses, imports, device sessions, assistant
│   ├── (teacher)/teacher/    # courses, classes, questions, assignments, exam-papers, analytics, assistant, settings
│   └── (student)/student/    # practice, coursework, test, practice-tests, error-log, confidence, results
└── api/                      # REST route handlers (questions, assignments, submissions, queues, etc.)

components/   # assistant, test, student, question-bank, questions, dashboard, ui
lib/          # supabase, parsers, ai, assistant, categorization, queues, jobs, permissions, authz, with-auth
mcp/          # MCP server powering the staff AI assistant
supabase/     # migrations, seed.sql, dev-seed.sql
messages/     # en.json, vi.json (next-intl)
pipeline/     # SAT content ingestion scripts (Bluebook → PDF, mapped import)
docs/ .docs/  # product specs, plans, schema, audits
```

---

## Local Development

### Prerequisites
- Node.js 18+
- pnpm
- Docker (for local Supabase)
- Supabase CLI

### Setup

```bash
pnpm install

# Start local Supabase (requires Docker)
supabase start

# Apply migrations
supabase db push

# Load seed data (tags / SAT categories)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed.sql

# Load dev data (users, courses, classes, students, questions)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/dev-seed.sql

# Start Next.js dev server
pnpm dev
```

### Local URLs

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase API | http://localhost:54321 |
| Supabase Studio | http://localhost:54323 |
| Database | postgresql://postgres:postgres@localhost:54322/postgres |

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm test` | Jest unit tests |
| `pnpm test:e2e` | Playwright e2e tests |
| `pnpm test:lighthouse` | Lighthouse CI |
| `pnpm test:load` / `pnpm test:perf` | Load + performance tests |
| `pnpm test:all` | Run unit + e2e + lighthouse + load |
| `pnpm mcp:dev` | Run the MCP assistant server locally |
| `pnpm check:stale-data` / `pnpm fix:stale-data` | Audit / repair stale data |

---

## Dev Test Accounts

> Created by `supabase/dev-seed.sql`; local development only.

### Staff

| Role | Email | Password |
|---|---|---|
| Admin | `admin@sat-platform.local` | `password123` |
| Teacher | `teacher@sat-platform.local` | `password123` |

### Students

> Students use Google OAuth in production. In local dev, email/password is available.

| Email | Password | Name | Status |
|---|---|---|---|
| `student1@gmail.com` | `password123` | Trần Thị An | Active |
| `student2@gmail.com` | `password123` | Lê Văn Bình | Active |
| `student3@gmail.com` | `password123` | Phạm Ngọc Chi | Active |
| `student4@gmail.com` | `password123` | Hoàng Minh Đức | Active |
| `student5@gmail.com` | `password123` | Ngô Thị Emmi | Active |
| `student6@gmail.com` | `password123` | Vũ Thành Phát | Active |
| `student7@gmail.com` | `password123` | Đinh Khánh Giang | Active |
| `student8@gmail.com` | `password123` | Trương Bảo Hân | **Disabled** (tests disabled-account flow) |

---

## Route Structure

Routes are locale-prefixed (`/en/...`, `/vi/...`).

```
/                   → Public marketing landing page
/login              → Student login (Google OAuth)
/staff-portal       → Hidden staff (admin/teacher) email-password login
/admin/*            → Admin only
/teacher/*          → Teacher + Admin
/student/*          → Student only
```

---

## Environment Variables

Create a `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>   # server only

# Anthropic / OpenAI (AI features + assistant)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Resend (email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Run `supabase start` to get the local `ANON KEY` and `SERVICE_ROLE KEY`.

---

## Key Documentation

| File | Description |
|---|---|
| `.docs/CLAUDE.md` | Claude Code instructions and project conventions |
| `.docs/SCHEMA.md` | Full database schema |
| `.docs/PRODUCT-ADMIN.md` | Admin + teacher feature spec |
| `.docs/PRODUCT-STUDENT.md` | Student feature spec |
| `.docs/PLAN.md` | Phased roadmap |
| `.docs/DOCX-TEMPLATE.md` / `.docs/PDF-TEMPLATE.md` | Question import formats |
| `.docs/RLS.md` / `docs/RLS_POLICIES.md` | Row Level Security policies |
| `.docs/DESIGN.md` | UI/UX design decisions |
| `docs/PERMISSIONS_RBAC_PLAN.md` / `docs/PERMISSIONS_RBAC_AUDIT.md` | RBAC design + audit |
| `docs/SAT_PRACTICE_TESTS_IMPLEMENTATION_PLAN.md` | Practice tests design |
| `docs/TRO_LY_AI_PLAN.md` | Staff AI assistant (MCP) design |
| `docs/PDF_DOCX_PARSER.md` | Question importer internals |
| `docs/LANDING_PAGE_AND_MONETIZATION_PLAN.md` | Landing page + monetization plan |

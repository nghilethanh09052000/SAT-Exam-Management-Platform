# CLAUDE.md — SAT Management Platform

> This file is for Claude Code. Read it fully at the start of every session.
> Last updated: 2026-05-10

---

## What This Project Is

A Vietnamese SAT preparation management platform for a single teacher and their students (~200 students). Teacher manages courses, classes, and assignments. Students take Bluebook-style SAT practice tests and review results.

**Not a public SaaS product.** One teacher, one school, private deployment.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Deployment | Vercel (prod) |
| Dev environment | Supabase local Docker (`supabase start`) |
| Styling | Tailwind CSS |
| Math rendering | KaTeX |
| SAT Calculator | Desmos API (embedded iframe) |
| Word parsing | Mammoth.js |
| Email | Resend.com |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |

---

## Project Structure

```
/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login pages
│   ├── (admin)/                # Admin panel pages
│   ├── (teacher)/              # Teacher dashboard pages
│   ├── (student)/              # Student-facing pages
│   └── api/                    # API routes
├── components/
│   ├── ui/                     # Shared UI components
│   ├── test/                   # Bluebook test interface components
│   ├── question-bank/          # Question bank components
│   └── dashboard/              # Dashboard components
├── lib/
│   ├── supabase/               # Supabase client + server helpers
│   ├── parsers/                # .docx parser logic (Mammoth.js)
│   ├── ai/                     # Claude API calls
│   └── utils/                  # Shared utilities
├── supabase/
│   ├── migrations/             # Database migrations
│   ├── functions/              # Edge Functions
│   └── seed.sql                # Seed data for dev
└── types/                      # TypeScript types (generated from Supabase)
```

---

## Database

Full schema is in `SCHEMA.md`. Key points for Claude Code:

- All PKs are UUID
- All tables have `created_at` and `updated_at`
- Soft deletes use `archived_at` (NULL = active)
- RLS is enabled on ALL tables — never bypass it
- Use Supabase server client (not browser client) in API routes and Server Components
- Use Supabase browser client only in Client Components

### Supabase Client Pattern

```typescript
// Server Component / API route
import { createServerClient } from '@/lib/supabase/server'
const supabase = createServerClient()

// Client Component
import { createBrowserClient } from '@/lib/supabase/browser'
const supabase = createBrowserClient()
```

---

## Authentication

| Role | Method |
|---|---|
| Admin | Email/password |
| Teacher | Email/password |
| Student | Google OAuth only |

- Auth is handled by Supabase Auth
- After login, user role is read from `profiles.role`
- Middleware in `middleware.ts` protects routes by role
- Device limit for students: 1 session at a time (enforced via `device_sessions` table)

### Route Protection Pattern

```
/admin/*     → Admin only
/teacher/*   → Teacher + Admin
/student/*   → Student only
/login       → Public
```

---

## Key Business Rules

These must never be violated in any code:

1. **One student = one active course at a time, one class within that course**
2. **Student login = Google OAuth only** — never show email/password form to students
3. **Score always shown immediately after submit** — regardless of `show_results` setting
4. **`show_results` setting only controls** whether full review (correct answers + explanations) is visible
5. **Content hash dedup** — check `questions.content_hash` before inserting any question
6. **Never edit `submission_answers` after `submissions.status = submitted`** — results are immutable
7. **Past submissions stay forever** — never delete `submissions` or `submission_answers`
8. **`error_log` is append-only** — never delete entries, only allow updating `student_note`
9. **Archived records** (`archived_at IS NOT NULL`) must never appear in normal queries — always filter `WHERE archived_at IS NULL`
10. **Tab switch events** — log to `tab_switch_events`, never expose to students

---

## Coding Conventions

### General
- TypeScript everywhere — no `any` types
- Use `zod` for all input validation (API routes + form inputs)
- Server Components by default — use Client Components only when needed (interactivity, hooks)
- Never use `useEffect` for data fetching — use Server Components or React Query

### Naming
- Components: PascalCase (`QuestionCard.tsx`)
- Functions/variables: camelCase (`getSubmission`)
- Database queries: snake_case matches DB columns
- Files: kebab-case (`question-card.tsx`)

### Error handling
- API routes return `{ data, error }` shape always
- Never `throw` in API routes — return error objects
- Show Vietnamese error messages in UI — never show raw error strings to users

### Supabase queries
- Always use `.select()` with explicit columns — never `select('*')` in production
- Always handle the `error` from Supabase responses
- Use RLS — never use service role key in frontend code

---

## .docx Parser

Parser logic lives in `lib/parsers/docx-parser.ts`.

The expected format is defined in `DOCX-TEMPLATE.md`. Key parsing rules:

- Module headings: `**Module N: [name]**` → sets current module for following questions
- Question start: `**Question N**` (bold, own line)
- Correct answer: the option with bold formatting (`is_bold: true` from Mammoth.js)
- Short answer: has `- **Answer:**` field instead of `- **Options:**`
- Images: extracted as base64 → uploaded to Supabase Storage `question-images` bucket → URL stored in `questions.image_url`
- Content hash: `SHA256(normalize(question_text + correct_answer))` where normalize = lowercase + strip whitespace + strip punctuation

On parse error → return `{ success: false, errors: [{ line: N, message: '...' }] }` — never partially save.

---

## AI Integration

AI calls live in `lib/ai/`.

### Tag suggestion (on upload)
```typescript
// Input: parsed question text + answer choices
// Output: { subject, skill_tag, difficulty }
// Model: claude-sonnet-4-20250514
// Called once per question during upload review
```

### Explanation generation
```typescript
// Input: question + correct answer + teacher examples (few-shot)
// Output: explanation text in teacher's style
// Model: claude-sonnet-4-20250514
// Called once per question, result cached in questions.ai_explanation
// NOT called per student submission
```

Always use `max_tokens: 1000` for explanations. Always wrap in try/catch — AI failures should not block the upload flow.

---

## Test Interface (Bluebook Clone)

The test interface is the most complex part of the frontend. Key rules:

- **Full screen only** — use `document.documentElement.requestFullscreen()` on test start
- **Checkpoint saves** must happen on every answer change → debounced 2s → upsert `submission_answers`
- **Timer** stored in React state + synced to `submissions.time_spent_seconds` every 30s
- **Tab switch detection**: `document.addEventListener('visibilitychange', ...)` → POST to `/api/tab-switch`
- **Right-click disabled** on test pages: `onContextMenu={(e) => e.preventDefault()}`
- **Text selection disabled** during active test: CSS `user-select: none` on question container
- **Watermark**: CSS overlay with `position: fixed`, `opacity: 0.07`, student name + email

### Checkpoint Pattern

```typescript
// On every answer change (debounced 2s):
await supabase
  .from('submission_answers')
  .upsert({
    submission_id: submissionId,
    question_id: questionId,
    selected_option_id: optionId,
    answered_at: new Date().toISOString(),
  }, { onConflict: 'submission_id,question_id' })
```

---

## Scoring

- `raw_score` = count of `submission_answers` where `is_correct = true`
- `scaled_score` = NULL for now (Phase 2)
- Set `is_correct` on each `submission_answer` at submit time by comparing against `question_options.is_correct`
- For short answer: normalize student input (lowercase + trim) and compare against all `question_accepted_answers`

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # Server only — never expose to client

# Anthropic
ANTHROPIC_API_KEY=               # Server only

# Resend
RESEND_API_KEY=                  # Server only

# App
NEXT_PUBLIC_APP_URL=
```

---

## Dev Setup

```bash
# Start local Supabase
supabase start

# Run migrations
supabase db push

# Start Next.js
pnpm dev
```

Local Supabase runs on:
- API: http://localhost:54321
- Studio: http://localhost:54323
- DB: postgresql://postgres:postgres@localhost:54322/postgres

---

## What NOT to Do

- ❌ Never use `supabase.auth.admin.*` in frontend code
- ❌ Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser
- ❌ Never delete `submissions`, `submission_answers`, or `error_log` rows
- ❌ Never use `select('*')` in production queries
- ❌ Never show raw Supabase error messages to users
- ❌ Never call the Claude API from a Client Component — always use an API route
- ❌ Never generate AI explanations per student view — only once per question
- ❌ Never allow students to access `/teacher/*` or `/admin/*` routes

---

## Related Documents

- `PRODUCT-ADMIN.md` — admin and teacher feature spec
- `PRODUCT-STUDENT.md` — student feature spec
- `PLAN.md` — phased roadmap (Pilot → Phase 1 → Phase 2)
- `SCHEMA.md` — full database design
- `DOCX-TEMPLATE.md` — Word upload format spec

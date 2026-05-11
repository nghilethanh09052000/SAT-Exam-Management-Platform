# SAT Management Platform

A Vietnamese SAT preparation management platform for a single teacher and their students. Teachers manage courses, classes, and assignments. Students take Bluebook-style SAT practice tests and review results.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Deployment | Vercel |
| Styling | Tailwind CSS |
| Math rendering | KaTeX |
| SAT Calculator | Desmos API |
| Word parsing | Mammoth.js |
| Email | Resend |
| AI | Anthropic Claude API |

---

## Local Development

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for Supabase local)
- Supabase CLI

### Setup

```bash
# Install dependencies
pnpm install

# Start local Supabase (requires Docker)
supabase start

# Apply migrations
supabase db push

# Load seed data (tags)
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

## Dev Test Accounts

> These accounts are created by `supabase/dev-seed.sql` and only exist in local development.

### Admin

| Field | Value |
|---|---|
| Email | `admin@sat-platform.local` |
| Password | `password123` |
| Access | `/admin/*` — full access to everything |

### Teacher

| Field | Value |
|---|---|
| Email | `teacher@sat-platform.local` |
| Password | `password123` |
| Name | Nguyễn Văn Thầy |
| Access | `/teacher/*` — manage courses, classes, questions, assignments |

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
| `student8@gmail.com` | `password123` | Trương Bảo Hân | **Disabled** (for testing disabled account flow) |

---

## Seed Data Overview

After running `dev-seed.sql`, the local database contains:

| Resource | Count | Details |
|---|---|---|
| Courses | 3 | SAT Spring 2025, SAT Fall 2025, SAT 2026 Advanced |
| Classes | 4 | Morning/Afternoon/Weekend/Advanced classes |
| Weeks | 5 | Across the first two classes |
| Enrollments | 9 | Students distributed across classes |
| Questions | 13 | 10 multiple choice + 3 short answer |
| Assignments | 3 | RW Module 1, Math Practice, Full Mixed |
| Assignment Instances | 4 | 2 expired, 1 active, 1 draft |
| Submissions | 7 | Mix of submitted and in-progress |

---

## Route Structure

```
/login              → Public (email/password for admin+teacher, Google OAuth for students)
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
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>

# Anthropic (AI features)
ANTHROPIC_API_KEY=

# Resend (email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Run `supabase start` to get the local `ANON KEY` and `SERVICE_ROLE KEY` printed in the terminal.

---

## Key Documentation

| File | Description |
|---|---|
| `.docs/CLAUDE.md` | Claude Code instructions and project conventions |
| `.docs/SCHEMA.md` | Full database schema |
| `.docs/PRODUCT-ADMIN.md` | Admin + teacher feature spec |
| `.docs/PRODUCT-STUDENT.md` | Student feature spec |
| `.docs/PLAN.md` | Phased roadmap |
| `.docs/DOCX-TEMPLATE.md` | Word upload format for question import |
| `.docs/RLS.md` | Row Level Security policies explained |
| `.docs/DESIGN.md` | UI/UX design decisions |

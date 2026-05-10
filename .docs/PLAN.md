# PLAN.md — SAT Platform: Development Roadmap

> **Status:** Living document. Update as features are completed or priorities shift.
> **Last updated:** 2026-05-10
> **Stack:** Next.js · Supabase · Vercel

---

## Overview

```
Pilot       → 1 week     → Core loop working, 5-10 students
Phase 1     → 1-2 months → Full feature set, real class launch
Phase 2     → 3 months+  → Advanced features, AI, analytics
```

The goal of the **Pilot** is to prove the core loop works end-to-end:
> Teacher uploads questions → assigns to class → student takes test → sees score

Everything else is built on top of this foundation.

---

## Pilot (Week 1) — Core Loop Only

Target: 5-10 students, internal testing with teacher.

### Auth & Users
- [x] Supabase Auth setup
- [ ] Google OAuth for students
- [ ] Email/password for Admin & Teacher
- [ ] 3 roles: Admin · Teacher · Student
- [ ] Basic RLS policies in Supabase

### Course & Class Structure
- [ ] Create Course (name, start/end date, expiration)
- [ ] Create Class inside Course (name, schedule text, start/end date)
- [ ] Create Week inside Class (label only)

### Student Enrollment
- [ ] Manual enrollment (name, email, phone)
- [ ] Assign student to 1 Class

### Question Bank (Basic)
- [ ] Manual question creation (multiple choice, 4 options)
- [ ] Manual tagging from fixed dropdown
- [ ] KaTeX math rendering in questions and answers

### Assignment
- [ ] Create assignment (title, pick questions from bank)
- [ ] Assign to Class + Week (auto-fill Course/Class/Week)
- [ ] Basic settings: deadline · timed/untimed · show results immediately
- [ ] Publish assignment → students see it

### Test Interface (Simplified Bluebook)
- [ ] Full-screen layout
- [ ] Countdown timer (auto-submit on timeout)
- [ ] Question navigation panel (○ · ● · ⚑ · ⚑● statuses)
- [ ] Answer selection (multiple choice)
- [ ] Submit test

### Results (Basic)
- [ ] Score shown immediately after submit
- [ ] Results table: question · student answer · correct answer
- [ ] Review mode: wrong = red · correct = green

### Deployment
- [ ] Deploy to Vercel
- [ ] Supabase project configured (dev + prod)
- [ ] Basic environment variables set

---

## Phase 1 (Month 1-2) — Full Feature Set

Target: Full class launch with real students.

### Auth & Security
- [ ] Device limit: 1 session per student account
- [ ] Device violation logging (visible to Admin + Teacher)
- [ ] Content protection on test pages:
  - Right-click disabled
  - Copy/paste disabled
  - CSS watermark (student name + email)
  - Tab-switch / window-blur event logging

### Student Enrollment
- [ ] Excel upload enrollment (columns: name · email · phone)
- [ ] Auto-enroll students into correct Class from Excel
- [ ] Deduplication: same email = same student record

### Question Bank (Full)
- [ ] .docx batch upload (Mammoth.js parser)
- [ ] Image extraction from .docx → saved to Supabase Storage
- [ ] Strict .docx template format enforced — error message on bad format
- [ ] AI tag suggestion on upload → teacher reviews and confirms
- [ ] Content hash deduplication on upload → side-by-side conflict UI
- [ ] Short answer / open-ended question type (multiple accepted answers)
- [ ] Edit question in bank (does not affect past results)
- [ ] Delete question from bank (manual dedup)
- [ ] Search and browse Question Bank

### Assignment (Full Settings)
- [ ] Full settings: shuffle · max retakes · score weighting · show results after deadline
- [ ] Duplicate assignment instance to another Class/Week
- [ ] Edit published assignment (deadline extension, settings)
- [ ] Assignment alert: deadline email via Resend.com (1× per day, 24h before deadline)

### Test Interface (Full Bluebook Clone)
- [ ] Highlight text (yellow)
- [ ] Per-question notes (scratchpad)
- [ ] Strikethrough answer choices
- [ ] Mark for Review flag
- [ ] Module flow (auto-advance to next module)
- [ ] Desmos calculator (Math modules)
- [ ] Untimed mode
- [ ] Checkpoint & resume (auto-save progress, timer resumes)
- [ ] Deadline lock (locked if past deadline, Vietnamese message)
- [ ] Retake support (N attempts, each recorded separately)

### Results (Full)
- [ ] Score shown immediately always
- [ ] Full review gated by teacher setting (immediately vs after deadline)
- [ ] Skill breakdown per tag category
- [ ] Time spent per question
- [ ] Teacher-written explanation per question
- [ ] Video explanation embed per question
- [ ] Error notes per question (student types personal note)

### Error Log
- [ ] Auto-collect all wrong answers across all assignments
- [ ] Filter by: skill tag · assignment
- [ ] Show personal error notes
- [ ] Redo wrong questions from Error Log
- [ ] Keep historical wrong answers even after correct retake

### Class Library
- [ ] Create folders per class
- [ ] Upload files (PDF · Word · video links)
- [ ] Broadcast notification to class

### Course Management
- [ ] Course expiration (soft-delete, archive in DB)
- [ ] Past courses shown as read-only for students until expiration
- [ ] Class end date → auto-hide assignments

### Teacher Dashboard (Basic)
- [ ] Assignment submission progress (who submitted / not submitted)
- [ ] Per-student answer review (answers + time per question)
- [ ] Tab-switch cheating signals in per-student review
- [ ] Class statistics: max · min · mean · most-missed questions
- [ ] Leaderboard (Admin + Teacher only)

### Admin Panel (Basic)
- [ ] View all students across all courses
- [ ] Enable / disable student accounts
- [ ] View device violation logs
- [ ] Manage course expiration settings

---

## Phase 2 (Month 3+) — Advanced Features

Target: Polish, AI enhancements, deeper analytics.

### AI Features
- [ ] AI-generated explanations per question (Claude API, cached)
- [ ] AI trained on teacher's explanation style (few-shot prompting)
- [ ] AI Chat Support for students (ask questions about specific problems)

### Vocabulary Notebook
- [ ] Save word from review mode → personal vocabulary list
- [ ] Add notes per word
- [ ] Delete saved words

### Student Dashboard (Full)
- [ ] Score trend chart over time
- [ ] Skill breakdown chart (weakest to strongest)
- [ ] Recent assignments with status
- [ ] Error log summary widget

### Teacher Dashboard (Advanced)
- [ ] Score trend per student over time
- [ ] Class-wide skill breakdown chart
- [ ] Retake attempt history per student
- [ ] Export results to Excel/CSV

### System Improvements
- [ ] Configurable cheating signal threshold
- [ ] SAT scaled score (200–800) conversion
- [ ] Mobile responsive improvements
- [ ] Performance optimization (DB indexing, query optimization)

---

## What Is Explicitly Out of Scope (Forever)

- Mobile app (web only)
- Payment / subscription management
- Multi-teacher support
- Student self-registration
- PDF question upload
- Real-time collaborative features
- Full screenshot / screen-recording prevention (not possible in browser)

---

## Dependencies & Blockers

| Blocker | Blocks | Status |
|---|---|---|
| `DOCX-TEMPLATE.md` defined | .docx parser (Phase 1) | ⏳ Not written |
| `SCHEMA.md` designed | All development | ⏳ Not written |
| `CLAUDE.md` written | Claude Code sessions | ⏳ Not written |
| Google Cloud OAuth configured | Student login | ⏳ Not set up |
| Resend.com account created | Deadline emails (Phase 1) | ⏳ Not set up |
| Desmos API reviewed | Calculator feature (Phase 1) | ⏳ Not reviewed |

---

## Next Documents to Write

```
1. DOCX-TEMPLATE.md   → define Word format before any parser code
2. SCHEMA.md          → database design (tables, relations, RLS)
3. CLAUDE.md          → context for Claude Code sessions
```

---

*Related documents: `PRODUCT-ADMIN.md` · `PRODUCT-STUDENT.md` · `SCHEMA.md` · `CLAUDE.md` · `DOCX-TEMPLATE.md`*

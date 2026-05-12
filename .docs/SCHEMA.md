# SCHEMA.md — SAT Platform: Database Design

> **Status:** Living document. Update as features evolve.
> **Last updated:** 2026-05-12
> **Database:** Supabase (PostgreSQL)
> **Dev:** Local Docker (`supabase start`)
> **Prod:** Supabase cloud (supabase.com)

---

## Conventions

- All tables use `UUID` primary keys (Supabase default)
- All tables have `created_at TIMESTAMPTZ DEFAULT now()`
- All tables have `updated_at TIMESTAMPTZ DEFAULT now()` (auto-updated via trigger)
- Soft deletes use `archived_at TIMESTAMPTZ DEFAULT NULL` — NULL means active
- Foreign keys use `ON DELETE RESTRICT` unless noted otherwise
- RLS (Row Level Security) enabled on all tables
- Snake_case for all table and column names

---

## Entity Relationship Overview

```
auth.users (Supabase Auth)
    └── profiles
            ├── courses (teacher creates)
            │     └── classes
            │           └── weeks
            │                 └── assignment_instances
            │                           ↑
            │                     assignments (Question Bank)
            │                           └── assignment_questions
            │                                       ↑
            │                                   questions
            │                                       ├── question_options
            │                                       ├── question_accepted_answers
            │                                       └── question_tags
            │                                               ↑
            │                                             tags
            ├── exam_papers (Ngân Hàng Đề Thi)
            │     └── exam_paper_questions ──────────────↑ questions
            ├── enrollments (student → class)
            ├── submissions (student → assignment_instance)
            │     └── submission_answers
            ├── error_log
            └── tab_switch_events
```

---

## Tables

---

### `profiles`
Extends Supabase `auth.users`. Created automatically on user signup via trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | References `auth.users.id` |
| `role` | ENUM | `admin` · `teacher` · `student` |
| `full_name` | TEXT | |
| `phone` | TEXT | Nullable |
| `avatar_url` | TEXT | From Google OAuth |
| `is_active` | BOOLEAN | Default `true`. Admin can disable |
| `is_approved` | BOOLEAN | Default `false`. Only students imported by admin are `true`. Organic Google signups stay `false` and are rejected at `/api/auth/callback` |
| `birth_year` | SMALLINT | Nullable. e.g. `2008` |
| `gender` | TEXT | Nullable. `'Nam'` · `'Nữ'` · `'Khác'` |
| `school` | TEXT | Nullable. Current school name |
| `city` | TEXT | Nullable. Province / city of residence |
| `facebook_url` | TEXT | Nullable. Personal Facebook URL |
| `threads_url` | TEXT | Nullable. Personal Threads URL |
| `hobbies` | TEXT | Nullable. Free text, comma-separated |
| `target_score` | SMALLINT | Nullable. SAT target score (400–1600) |
| `source` | TEXT | Nullable. How the student heard about the platform |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- User can read and update their own profile
- Admin can read and update all profiles
- Teacher can read profiles of students in their classes

---

### `device_sessions`
Tracks active login sessions per student. Enforces 1-device limit.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → `profiles.id` | |
| `session_token` | TEXT | Supabase session token |
| `device_info` | TEXT | Browser/OS info (best effort) |
| `logged_in_at` | TIMESTAMPTZ | |
| `last_active_at` | TIMESTAMPTZ | |
| `is_violation` | BOOLEAN | True if limit was exceeded at login |
| `created_at` | TIMESTAMPTZ | |

**RLS:**
- Student can read their own sessions
- Admin and Teacher can read all sessions (for violation monitoring)

---

### `courses`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `teacher_id` | UUID FK → `profiles.id` | |
| `title` | TEXT | e.g. "SAT Intensive Q3 2025" |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `expires_at` | TIMESTAMPTZ | Null = never expires. After this → archived |
| `archived_at` | TIMESTAMPTZ | Null = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD their own courses
- Student can read courses they are enrolled in (via enrollments)
- Admin can read/update all courses

---

### `classes`
A class is a scheduled group inside a course. Student belongs to one class per course.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `course_id` | UUID FK → `courses.id` | |
| `title` | TEXT | e.g. "Lớp Sáng Thứ 2-4" |
| `schedule_text` | TEXT | Free text, e.g. "Thứ 2, 4 — 8:00–10:00" |
| `start_date` | DATE | |
| `end_date` | DATE | When passed → assignments hidden from students |
| `archived_at` | TIMESTAMPTZ | Null = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD classes in their own courses
- Student can read their enrolled class only
- Admin full access

---

### `enrollments`
Links a student to a class (and implicitly to the course).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK → `profiles.id` | |
| `class_id` | UUID FK → `classes.id` | |
| `enrolled_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**Constraints:**
- UNIQUE(`student_id`, `class_id`) — no duplicate enrollment
- One student can only be enrolled in one class per course (enforced at app level)

**RLS:**
- Teacher can manage enrollments for their own classes
- Student can read their own enrollment
- Admin full access

---

### `weeks`
Label-only grouping inside a class.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `class_id` | UUID FK → `classes.id` | |
| `title` | TEXT | e.g. "Tuần 1" |
| `order` | INTEGER | Display order |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD weeks in their own classes
- Student can read weeks in their enrolled class
- Admin full access

---

### `tags`
Fixed predefined tag list. No free-text tags allowed.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `subject` | ENUM | `reading_writing` · `math` |
| `name` | TEXT | e.g. "Words in Context", "Linear Equations" |
| `created_at` | TIMESTAMPTZ | |

**RLS:**
- All authenticated users can read tags
- Only Admin can create/update/delete tags

---

### `questions`
Lives in the Question Bank. Reusable across assignments.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `created_by` | UUID FK → `profiles.id` | Teacher who uploaded |
| `type` | ENUM | `multiple_choice` · `short_answer` |
| `content` | TEXT | Question text (may include KaTeX) |
| `image_url` | TEXT | Nullable. URL to Supabase Storage |
| `difficulty` | ENUM | `easy` · `medium` · `hard` · NULL |
| `content_hash` | TEXT UNIQUE | SHA256 of normalized content + correct answer. Used for dedup |
| `ai_explanation` | TEXT | Cached AI explanation. Nullable until generated |
| `teacher_explanation` | TEXT | Nullable |
| `video_url` | TEXT | Nullable. YouTube/Loom embed link |
| `archived_at` | TIMESTAMPTZ | Null = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD their own questions
- All teachers can read all questions (shared bank)
- Students cannot read questions directly (only through active assignment)
- Admin full access

---

### `question_options`
Answer choices for multiple choice questions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question_id` | UUID FK → `questions.id` ON DELETE CASCADE | |
| `label` | TEXT | e.g. "A", "B", "C", "D" |
| `content` | TEXT | Option text (may include KaTeX) |
| `is_correct` | BOOLEAN | Only one option should be true per question |
| `order` | INTEGER | Display order |
| `created_at` | TIMESTAMPTZ | |

**RLS:** Same as `questions`

---

### `question_accepted_answers`
For short answer / open-ended questions. Multiple accepted variants.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question_id` | UUID FK → `questions.id` ON DELETE CASCADE | |
| `answer_text` | TEXT | One accepted answer variant |
| `created_at` | TIMESTAMPTZ | |

**RLS:** Same as `questions`

---

### `question_tags`
Many-to-many: questions ↔ tags.

| Column | Type | Notes |
|---|---|---|
| `question_id` | UUID FK → `questions.id` ON DELETE CASCADE | |
| `tag_id` | UUID FK → `tags.id` ON DELETE RESTRICT | |

**Constraints:** PRIMARY KEY(`question_id`, `tag_id`)

**RLS:** Same as `questions`

---

### `assignments`
The reusable question set living in the Question Bank.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `created_by` | UUID FK → `profiles.id` | |
| `title` | TEXT | Teacher types manually |
| `archived_at` | TIMESTAMPTZ | Null = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD their own assignments
- All teachers can read all assignments (shared bank)
- Students cannot read assignments directly
- Admin full access

---

### `assignment_questions`
Ordered list of questions inside an assignment.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `assignment_id` | UUID FK → `assignments.id` ON DELETE CASCADE | |
| `question_id` | UUID FK → `questions.id` ON DELETE RESTRICT | |
| `order` | INTEGER | Display order |
| `score_weight` | NUMERIC | Default 1. Per-question point value |
| `module` | TEXT | e.g. "Reading & Writing Module 1", "Math Module 2" |
| `created_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`assignment_id`, `question_id`)

---

### `assignment_instances`
A specific delivery of an assignment to a class + week, with its own settings.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `assignment_id` | UUID FK → `assignments.id` | |
| `class_id` | UUID FK → `classes.id` | Auto-filled from context |
| `week_id` | UUID FK → `weeks.id` | Auto-filled from context |
| `deadline` | TIMESTAMPTZ | |
| `is_timed` | BOOLEAN | Default `true` |
| `time_limit_seconds` | INTEGER | Nullable if untimed |
| `show_results` | ENUM | `immediately` · `after_deadline` |
| `shuffle_questions` | BOOLEAN | Default `false` |
| `shuffle_options` | BOOLEAN | Default `false` |
| `max_retakes` | INTEGER | Default 0 |
| `alert_enabled` | BOOLEAN | Default `true` |
| `published_at` | TIMESTAMPTZ | Null = draft |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- Teacher can CRUD instances in their own classes
- Student can read instances for their enrolled class only
- Admin full access

---

### `submissions`
One record per student per assignment instance per attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `instance_id` | UUID FK → `assignment_instances.id` | |
| `student_id` | UUID FK → `profiles.id` | |
| `attempt_number` | INTEGER | 1 = first attempt, 2 = first retake, etc. |
| `status` | ENUM | `in_progress` · `submitted` · `expired` |
| `raw_score` | INTEGER | Number of correct answers. Null until submitted |
| `scaled_score` | INTEGER | Nullable. Calculated later when scaling is implemented |
| `total_questions` | INTEGER | Snapshot at time of submission |
| `started_at` | TIMESTAMPTZ | |
| `submitted_at` | TIMESTAMPTZ | Null if not yet submitted |
| `time_spent_seconds` | INTEGER | Total time from start to submit |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`instance_id`, `student_id`, `attempt_number`)

**RLS:**
- Student can read their own submissions
- Teacher can read submissions for their own classes
- Admin full access

---

### `submission_answers`
One record per question per submission. Stores full state for checkpoint/resume.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `submission_id` | UUID FK → `submissions.id` ON DELETE CASCADE | |
| `question_id` | UUID FK → `questions.id` | |
| `selected_option_id` | UUID FK → `question_options.id` | Nullable (multiple choice) |
| `answer_text` | TEXT | Nullable (short answer) |
| `is_correct` | BOOLEAN | Null until submitted |
| `is_marked_for_review` | BOOLEAN | Default `false` |
| `highlight_data` | JSONB | Stores highlight ranges. Null if none |
| `note_text` | TEXT | Student's per-question scratchpad note |
| `strikethrough_data` | JSONB | Stores which options are crossed out |
| `time_spent_seconds` | INTEGER | Time on this question |
| `answered_at` | TIMESTAMPTZ | Last time student touched this question |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`submission_id`, `question_id`)

**RLS:**
- Student can read/write their own answers (only during active submission)
- Teacher can read answers for their own class submissions
- Admin full access

---

### `error_log`
Auto-populated when a submission is marked correct/incorrect.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK → `profiles.id` | |
| `submission_id` | UUID FK → `submissions.id` | Which attempt this error came from |
| `question_id` | UUID FK → `questions.id` | |
| `student_note` | TEXT | Student's personal error note. Nullable |
| `created_at` | TIMESTAMPTZ | When the wrong answer was recorded |
| `updated_at` | TIMESTAMPTZ | When note was last edited |

**Notes:**
- Records are never deleted — permanent historical record
- Even if student answers correctly on a retake, past error entries remain
- Student can only edit `student_note` — no other field

**RLS:**
- Student can read their own error log and update `student_note`
- Teacher can read error log entries for their own class students
- Admin full access

---

### `tab_switch_events`
Cheating signal log during active tests.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `submission_id` | UUID FK → `submissions.id` ON DELETE CASCADE | |
| `student_id` | UUID FK → `profiles.id` | |
| `event_type` | ENUM | `tab_switch` · `window_blur` · `window_focus` |
| `occurred_at` | TIMESTAMPTZ | |

**RLS:**
- Student cannot read this table
- Teacher can read events for their own class submissions
- Admin full access

---

### `class_library_folders`
Folders inside a class library.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `class_id` | UUID FK → `classes.id` ON DELETE CASCADE | |
| `title` | TEXT | |
| `order` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

---

### `class_library_files`
Files uploaded to a class library folder.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `folder_id` | UUID FK → `class_library_folders.id` ON DELETE CASCADE | |
| `title` | TEXT | |
| `file_url` | TEXT | Supabase Storage URL or external video link |
| `file_type` | ENUM | `pdf` · `word` · `video_link` |
| `uploaded_by` | UUID FK → `profiles.id` | |
| `created_at` | TIMESTAMPTZ | |

---

### `notifications`
Broadcast notifications sent by teacher to a class.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `class_id` | UUID FK → `classes.id` | |
| `sent_by` | UUID FK → `profiles.id` | |
| `message` | TEXT | |
| `sent_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

### `exam_papers`
Reusable full-test templates (Ngân Hàng Đề Thi). Composed of questions from the question bank. Can be assigned to classes the same way `assignments` are.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `created_by` | UUID FK → `profiles.id` ON DELETE RESTRICT | Teacher who created it |
| `title` | TEXT | e.g. "SAT Practice Test 1" |
| `source` | TEXT | Nullable. e.g. "College Board", "Khan Academy" |
| `year` | SMALLINT | Nullable. Publication year, e.g. `2024` |
| `description` | TEXT | Nullable |
| `archived_at` | TIMESTAMPTZ | Null = active |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

**RLS:**
- All authenticated users can read non-archived exam papers
- Teacher and Admin can insert
- Owner or Admin can update / delete

---

### `exam_paper_questions`
Ordered list of questions inside an exam paper.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `exam_paper_id` | UUID FK → `exam_papers.id` ON DELETE CASCADE | |
| `question_id` | UUID FK → `questions.id` ON DELETE RESTRICT | |
| `module_name` | TEXT | Nullable. e.g. "Reading & Writing Module 1", "Math Module 2" |
| `order_index` | INTEGER | Display order. Default `0` |
| `score_weight` | NUMERIC | Per-question point value. Default `1` |
| `created_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`exam_paper_id`, `question_id`)

**RLS:** Same as parent `exam_papers` (owner or admin can insert/delete; all authenticated users can read)

---

## Supabase Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `question-images` | Images extracted from .docx uploads | Authenticated read, teacher write |
| `class-library` | Files uploaded to class library | Enrolled students read, teacher write |

---

## Key Triggers & Functions

| Trigger | On | Does |
|---|---|---|
| `handle_new_user` | INSERT on `auth.users` | Auto-creates `profiles` record |
| `set_updated_at` | UPDATE on any table | Sets `updated_at = now()` |
| `set_exam_papers_updated_at` | UPDATE on `exam_papers` | Sets `updated_at = now()` |
| `auto_populate_error_log` | INSERT on `submission_answers` where `is_correct = false` | Auto-inserts into `error_log` |
| `archive_expired_courses` | Scheduled (daily) | Sets `archived_at` on courses past `expires_at` |

---

## Scheduled Edge Functions (Supabase)

| Function | Schedule | Does |
|---|---|---|
| `send_deadline_alerts` | Daily (morning) | Finds assignment instances with deadline within 24h → sends email via Resend.com |
| `archive_expired_courses` | Daily (midnight) | Archives courses past expiration date |

---

## Open Questions (Schema)

- [ ] Max students per class? (affects indexing strategy)
- [ ] Should `highlight_data` and `strikethrough_data` be JSONB or a separate table? (JSONB is simpler, separate table is more queryable — low priority)
- [ ] When scaling is implemented, where does the score conversion table live? (separate `score_scale` table, one row per test form)

---

*Related documents: `PRODUCT-ADMIN.md` · `PRODUCT-STUDENT.md` · `PLAN.md` · `CLAUDE.md`*

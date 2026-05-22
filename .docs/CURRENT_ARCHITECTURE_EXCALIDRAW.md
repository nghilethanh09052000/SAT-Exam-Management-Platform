# Current Architecture + Database Design

Use this as the source text for an Excalidraw architecture diagram. It reflects the current codebase as of the latest migrations in `supabase/migrations`.

## 1. Current System Architecture

### Main Boxes

Draw these as large grouped areas:

1. **Users**
   - Admin
   - Teacher
   - Student

2. **Vercel Free: Next.js 14 App**
   - App Router pages
   - Server Components
   - Client Components
   - Middleware
   - API Routes

3. **Supabase Pro**
   - Auth
   - PostgreSQL
   - Row Level Security
   - Storage
   - RPC / Postgres functions
   - Triggers

4. **External Services**
   - Google OAuth
   - Resend email
   - Anthropic Claude API
   - Desmos API

5. **Future Worker / Queue**
   - Vercel Queue or queue-like job table
   - Background workers
   - Heavy parsing / AI generation / email / imports

6. **Optional Separate SAT Pipeline**
   - Python FastAPI
   - Temporal worker
   - Scrapers
   - GCS
   - BigQuery / dbt
   - App DB sync

### Current Runtime Flow

```text
Admin / Teacher / Student
  -> Browser
  -> Vercel Next.js App
      -> middleware.ts
          -> refresh Supabase session
          -> locale routing via next-intl
          -> route guard by role: admin / teacher / student
          -> role cache cookie for 5 minutes

Vercel Next.js App
  -> Supabase Auth
      -> email/password for admin and teacher
      -> Google OAuth for students
      -> auth.users
      -> trigger creates public.profiles

Next.js Server Components / API Routes
  -> Supabase PostgreSQL
      -> normal anon client for user-scoped reads and writes
      -> service-role client for privileged server-only flows
      -> RLS policies protect row access
      -> SECURITY DEFINER functions avoid recursive RLS and handle atomic actions

Next.js API Routes
  -> Supabase Storage
      -> question-imports bucket for uploaded DOCX/PDF source files
      -> stores original import files
      -> file_imports tracks parse/save status

Next.js API Routes
  -> Local Node parsers
      -> Mammoth for DOCX
      -> pdf-parse for PDF
      -> parsed questions returned to teacher review UI
      -> reviewed questions saved to question bank

Student test UI
  -> create_submission_attempt RPC
  -> submission_answers autosave route
  -> submit route scores answers
  -> database trigger inserts wrong answers into error_log

Student exercise UI
  -> exercise_attempts / exercise_answers
  -> complete_exercise_attempt RPC
  -> updates daily_activity and student_streaks atomically
```

### Suggested Excalidraw Layout

```text
+-----------------------+
| Users                 |
| Admin Teacher Student |
+-----------+-----------+
            |
            | HTTPS
            v
+------------------------------------------------------+
| Vercel Free - Next.js 14                             |
|                                                      |
| App Router pages                                     |
| - /admin                                             |
| - /teacher                                           |
| - /student                                           |
|                                                      |
| middleware.ts                                        |
| - session refresh                                    |
| - next-intl locale routing                           |
| - role route guards                                  |
|                                                      |
| API Routes                                           |
| - admin/users, students/import                       |
| - courses, classes, weeks, enrollments               |
| - questions parse/bulk-save/question bank            |
| - assignments/instances/submissions                  |
| - exercises/streak/error-log                         |
+-----------+-------------------------------+----------+
            |                               |
            | Supabase JS / SSR             | External APIs
            v                               v
+----------------------------------+   +----------------------+
| Supabase Pro                     |   | External Services     |
|                                  |   | - Google OAuth        |
| Auth                             |   | - Resend              |
| PostgreSQL + RLS                 |   | - Anthropic Claude    |
| Storage                          |   | - Desmos              |
| RPC functions                    |   +----------------------+
| Triggers                         |
+-----------+----------------------+
            |
            | future async jobs
            v
+----------------------------------+
| Future Worker / Queue            |
| - question import parsing        |
| - AI explanation/tag generation  |
| - deadline alerts                |
| - archive expired courses        |
| - large exports                  |
+----------------------------------+
```

## 2. Current Application Modules

### Admin

Admin manages platform-wide data.

```text
Admin
  -> users
  -> students import
  -> courses
  -> device sessions
  -> import history
  -> global dashboards
```

### Teacher

Teacher manages learning content and class delivery.

```text
Teacher
  -> courses
      -> classes
          -> weeks
          -> enrollments
          -> assignment instances
  -> question bank
      -> upload DOCX/PDF
      -> parse
      -> review
      -> bulk save
  -> assignments
      -> assignment_questions
  -> exam papers
      -> exam_paper_questions
  -> student submissions / error log / tab events
```

### Student

Student consumes assignments and practice.

```text
Student
  -> dashboard
  -> assigned SAT tests
      -> create attempt
      -> answer autosave
      -> submit
      -> review results depending on assignment setting
  -> free exercises
      -> exercise attempt
      -> complete exercise
      -> streak and daily activity
  -> error log
  -> profile
```

## 3. Current Database Design

### Identity And Access

```text
auth.users
  1:1 public.profiles

profiles
  id PK, FK auth.users.id
  role: admin | teacher | student
  full_name, phone, avatar_url
  is_active
  is_approved
  student fields: birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source
```

Related table:

```text
device_sessions
  user_id -> profiles.id
  session_token
  device_info
  logged_in_at
  last_active_at
  is_violation
```

### Course / Class Model

```text
profiles teacher
  1:N courses
      1:N classes
          1:N weeks
          1:N enrollments
```

Tables:

```text
courses
  id PK
  teacher_id -> profiles.id
  title
  start_date, end_date
  expires_at
  archived_at

classes
  id PK
  course_id -> courses.id
  title
  schedule_text
  archived_at

weeks
  id PK
  class_id -> classes.id
  title
  order

enrollments
  id PK
  student_id -> profiles.id
  class_id -> classes.id
  unique(student_id, class_id)
```

Note: the latest migration removed `classes.start_date` and `classes.end_date`; classes now inherit course dates and store only `schedule_text`.

### Question Bank

```text
profiles teacher
  1:N questions
      1:N question_options
      1:N question_accepted_answers
      N:M tags through question_tags
```

Tables:

```text
questions
  id PK
  created_by -> profiles.id
  type: multiple_choice | short_answer
  content
  image_url
  difficulty: easy | medium | hard
  content_hash unique
  ai_explanation
  teacher_explanation
  video_url
  archived_at

question_options
  id PK
  question_id -> questions.id
  label
  content
  is_correct
  order

question_accepted_answers
  id PK
  question_id -> questions.id
  answer_text

tags
  id PK
  subject: reading_writing | math
  name

question_tags
  question_id -> questions.id
  tag_id -> tags.id
  primary key(question_id, tag_id)
```

### Assignments And Delivered Tests

```text
assignments
  1:N assignment_questions
       N:1 questions

assignments
  1:N assignment_instances
       N:1 classes
       N:1 weeks
```

Tables:

```text
assignments
  id PK
  created_by -> profiles.id
  title
  archived_at

assignment_questions
  id PK
  assignment_id -> assignments.id
  question_id -> questions.id
  order
  score_weight
  module
  unique(assignment_id, question_id)

assignment_instances
  id PK
  assignment_id -> assignments.id
  class_id -> classes.id
  week_id -> weeks.id
  deadline
  is_timed
  time_limit_seconds
  show_results: immediately | after_deadline
  shuffle_questions
  shuffle_options
  max_retakes
  alert_enabled
  published_at
```

### Student Test Attempts

```text
assignment_instances
  1:N submissions
      1:N submission_answers

submission_answers wrong answer
  -> trigger
  -> error_log
```

Tables:

```text
submissions
  id PK
  instance_id -> assignment_instances.id
  student_id -> profiles.id
  attempt_number
  status: in_progress | submitted | expired
  raw_score
  scaled_score
  total_questions
  current_question_id -> questions.id
  started_at
  submitted_at
  time_spent_seconds
  unique(instance_id, student_id, attempt_number)

submission_answers
  id PK
  submission_id -> submissions.id
  question_id -> questions.id
  selected_option_id -> question_options.id
  answer_text
  is_correct
  is_marked_for_review
  highlight_data jsonb
  note_text
  strikethrough_data jsonb
  time_spent_seconds
  answered_at
  unique(submission_id, question_id)

error_log
  id PK
  student_id -> profiles.id
  submission_id -> submissions.id
  question_id -> questions.id
  student_note

tab_switch_events
  id PK
  submission_id -> submissions.id
  student_id -> profiles.id
  event_type: tab_switch | window_blur | window_focus
  occurred_at
```

### Exam Papers

Exam papers are reusable full-test templates composed from the shared question bank.

```text
exam_papers
  1:N exam_paper_questions
       N:1 questions
```

Tables:

```text
exam_papers
  id PK
  created_by -> profiles.id
  title
  source
  year
  description
  archived_at

exam_paper_questions
  id PK
  exam_paper_id -> exam_papers.id
  question_id -> questions.id
  module_name
  order_index
  score_weight
  unique(exam_paper_id, question_id)
```

### Free Exercises And Streaks

```text
exercises
  1:N exercise_questions
       N:1 questions

profiles student
  1:N exercise_attempts
      1:N exercise_answers

profiles student
  1:1 student_streaks
  1:N daily_activity
```

Tables:

```text
exercises
  id PK
  title
  description
  difficulty
  category
  estimated_minutes
  is_published

exercise_questions
  id PK
  exercise_id -> exercises.id
  question_id -> questions.id
  order_index
  unique(exercise_id, question_id)

exercise_attempts
  id PK
  student_id -> profiles.id
  exercise_id -> exercises.id
  correct_count
  total_questions
  status: in_progress | completed
  started_at
  completed_at

exercise_answers
  id PK
  attempt_id -> exercise_attempts.id
  question_id -> questions.id
  selected_option_id -> question_options.id
  answer_text
  is_correct
  answered_at

student_streaks
  student_id PK -> profiles.id
  current_streak
  longest_streak
  last_activity_date
  total_days_active
  updated_at

daily_activity
  id PK
  student_id -> profiles.id
  activity_date
  exercises_completed
  unique(student_id, activity_date)
```

### Class Library And Notifications

```text
classes
  1:N class_library_folders
      1:N class_library_files

classes
  1:N notifications
```

Tables:

```text
class_library_folders
  id PK
  class_id -> classes.id
  title
  order

class_library_files
  id PK
  folder_id -> class_library_folders.id
  title
  file_url
  file_type: pdf | word | video_link
  uploaded_by -> profiles.id

notifications
  id PK
  class_id -> classes.id
  sent_by -> profiles.id
  message
  sent_at
```

### Imports And Storage

```text
Supabase Storage bucket: question-imports
  -> original DOCX/PDF files
  -> referenced by file_imports.storage_path
```

Table:

```text
file_imports
  id PK
  uploaded_by -> profiles.id
  original_filename
  storage_bucket
  storage_path unique with storage_bucket
  file_type: docx | pdf
  mime_type
  file_size_bytes
  import_type
  source_context
  total_records
  success_count
  failure_count
  status: processing | parsed | success | partial_success | failed
  error_message
```

## 4. Database Security Model

Draw this as a side panel next to Supabase PostgreSQL.

```text
RLS is enabled on app tables.

Roles:
  admin
    -> broad read/write access
  teacher
    -> owns courses/classes/content
    -> can read shared question/assignment banks
    -> can read students enrolled in own classes
  student
    -> own profile
    -> own enrollments
    -> published assignments for enrolled classes
    -> own submissions/answers/error log
    -> published exercises and own streaks

Security definer helpers:
  auth_user_role()
  auth_teacher_has_student(student_id)
  auth_student_enrolled_in_course(course_id)
  auth_student_enrolled_in_class(class_id)
  create_submission_attempt(instance_id)
  complete_exercise_attempt(attempt_id, correct_count, total)
```

## 5. Important Database Functions And Triggers

```text
handle_new_user
  auth.users insert
  -> creates profiles row

set_updated_at
  updates updated_at columns

auto_populate_error_log
  submission_answers insert with is_correct = false
  -> inserts error_log row

create_submission_attempt
  validates authenticated student
  validates assignment instance, deadline, enrollment, retake limit
  creates next submission attempt atomically

complete_exercise_attempt
  validates attempt ownership
  marks exercise attempt completed
  upserts daily_activity
  updates student_streaks

archive_expired_courses
  marks expired courses archived
```

## 6. Current API Route Groups

```text
/api/auth/callback
  Google OAuth callback and student approval gate

/api/admin/users
/api/admin/students/import
  admin user and student management

/api/courses
/api/classes
/api/weeks
/api/enrollments
  course/class structure and roster management

/api/questions
/api/questions/parse
/api/questions/bulk-save
  question bank CRUD, DOCX/PDF parsing, reviewed import saving

/api/assignments
/api/assignment-instances
  reusable assignments and class/week delivery

/api/submissions
/api/submission-answers
/api/submissions/[id]/submit
  test attempts, autosave, final submission

/api/exam-papers
  reusable exam paper templates

/api/exercises
/api/exercises/[id]/complete
/api/student/streak
  free practice and streak system

/api/error-log
/api/device-sessions
  review and monitoring
```

## 7. Current Deployment View

```text
Vercel Free
  hosts Next.js app
  API routes run as serverless functions
  good for request/response work
  risky for long-running parsing, bulk imports, scraping, scheduled jobs

Supabase Pro
  hosts Auth
  hosts PostgreSQL
  enforces RLS
  stores uploaded import source files
  runs database functions and triggers
  can support cron-like scheduled database jobs if configured
```

## 8. Future Worker / Queue Recommendation

Given Vercel Free limits, move long or retryable work out of request/response routes.

### Add A Job Queue Boundary

Draw this between Next.js and the worker:

```text
Next.js API route
  -> create job row / enqueue task
  -> return job id immediately

Worker
  -> picks queued job
  -> does heavy work
  -> writes result/status back to Supabase

Client
  -> polls job/import status
  -> shows success/failure
```

### Candidate Jobs

```text
question_import_parse
  input: file_import_id
  work: download DOCX/PDF, parse, deduplicate
  output: parsed question draft JSON/status

question_bulk_save
  input: reviewed question batch
  work: insert questions/options/answers/tags in chunks
  output: success_count/failure_count

ai_explanation_generate
  input: question_id
  work: call Anthropic
  output: questions.ai_explanation

ai_tag_suggest
  input: question_id
  work: call Anthropic or rules
  output: suggested tag

deadline_alerts
  input: schedule
  work: find assignment deadlines and send Resend emails
  output: notification/email logs

archive_expired_courses
  input: schedule
  work: call archive_expired_courses function
  output: archived rows count

large_export
  input: exam_paper_id or class_id
  work: build PDF/DOCX/ZIP
  output: storage path and signed URL
```

### Minimal Queue Tables

If you start without a managed queue, add a Postgres-backed queue:

```text
jobs
  id PK
  type
  status: queued | running | succeeded | failed | retrying
  payload jsonb
  result jsonb
  attempts
  max_attempts
  run_after
  locked_at
  locked_by
  error_message
  created_by -> profiles.id
  created_at
  updated_at

job_events
  id PK
  job_id -> jobs.id
  level: info | warning | error
  message
  metadata jsonb
  created_at
```

### Worker Deployment Options

```text
Option A: Supabase scheduled functions / Edge functions
  good for small scheduled jobs
  not ideal for heavy DOCX/PDF parsing

Option B: Vercel Cron + short API worker endpoint
  simple
  still constrained by Vercel function limits

Option C: External worker on Railway/Fly/Render
  best fit for parsing, AI, exports, retries
  reads jobs from Supabase
  uses service role key only in worker environment

Option D: Dedicated queue provider
  Upstash QStash / Inngest / Trigger.dev / Cloudflare Queues
  cleaner retries and observability
```

Recommended next step for this codebase:

```text
Supabase Pro remains the system of record.
Vercel Free remains the UI/API request layer.
Add a worker for heavy async jobs.
Start with jobs + job_events tables in Supabase.
Later replace the Postgres queue with managed queue infrastructure if volume grows.
```

## 9. One-Page Excalidraw Summary

For a compact diagram, draw only this:

```text
Users
  -> Vercel Next.js App
      -> Middleware: session, locale, role guard
      -> Pages: admin / teacher / student
      -> API Routes: CRUD, parsing, submissions, exercises
  -> Supabase Pro
      -> Auth
      -> Postgres + RLS
      -> Storage question-imports
      -> RPC functions and triggers
  -> External Services
      -> Google OAuth
      -> Resend
      -> Anthropic
      -> Desmos

Core DB:
  auth.users -> profiles
  profiles teacher -> courses -> classes -> weeks
  profiles student -> enrollments -> classes
  questions -> options / accepted_answers / tags
  assignments -> assignment_questions -> questions
  assignment_instances -> class + week + assignment
  submissions -> submission_answers -> error_log
  exam_papers -> exam_paper_questions -> questions
  exercises -> exercise_questions -> questions
  exercise_attempts -> exercise_answers
  student_streaks + daily_activity

Future:
  Next.js API -> Queue/jobs -> Worker -> Supabase
```

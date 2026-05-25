# RLS Policy Reference

Snapshot source: Supabase MCP query against the production `public` schema.

This document explains the row-level security (RLS) policies currently present in the database and how they map to the SAT exam management platform. The platform has three primary application roles stored in `public.profiles.role`: `admin`, `teacher`, and `student`.

## Shared Concepts

Most policies use one of these authorization ideas:

- `auth.uid()` is the currently authenticated Supabase user id.
- `auth_user_role()` is a `SECURITY DEFINER` helper that reads `public.profiles.role` for the current user without causing recursive RLS checks.
- `auth_student_enrolled_in_class(class_id)` and `auth_student_enrolled_in_course(course_id)` check whether the current student is enrolled in a class/course.
- `auth_teacher_has_student(student_id)` checks whether a teacher teaches a class that contains the student.
- Admin policies generally grant full operational access.
- Teacher policies generally scope access to rows owned by the teacher or attached to classes/courses taught by the teacher.
- Student policies generally scope reads and writes to the student's own submissions, attempts, enrollments, and activity.

Unless a policy exists for an action, RLS denies that action. This is why many tables have explicit student read policies but no student write policies.

## Policy Inventory

The database currently has RLS enabled on these public tables:

| Area | Tables |
|---|---|
| Identity and access | `profiles`, `device_sessions` |
| Courses and membership | `courses`, `classes`, `weeks`, `enrollments` |
| Question bank | `tags`, `questions`, `question_options`, `question_accepted_answers`, `question_tags` |
| Assignments | `assignments`, `assignment_questions`, `assignment_instances` |
| Student assigned tests | `submissions`, `submission_answers`, `error_log`, `tab_switch_events` |
| Class resources | `class_library_folders`, `class_library_files`, `notifications` |
| Public/free exams | `exam_papers`, `exam_paper_questions`, `public_exam_attempts`, `public_exam_answers` |
| Exercises and progress | `exercises`, `exercise_questions`, `exercise_attempts`, `exercise_answers`, `daily_activity`, `student_streaks` |
| Imports | `file_imports`, `file_import_results`, `student_imports` |

## Identity And Sessions

### `profiles`

Stores application profile data and role for each `auth.users` user. This is the root authorization table, so the policies deliberately avoid direct self-joins that would recurse.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `profiles_select_admin` | SELECT | Admins can read all profiles. | Admin user management and oversight. |
| `profiles_select_own` | SELECT | Users can read their own profile. | Enables account pages, layout role checks, and self-service profile data. |
| `profiles_select_teacher` | SELECT | Teachers can read profiles for students they teach. | Teacher rosters and class/student views need limited student profile visibility. |
| `profiles_update_admin` | UPDATE | Admins can update profiles. | Admins manage roles, approvals, and user status. |
| `profiles_update_own` | UPDATE | Users can update their own profile row. | Lets users edit personal metadata without touching other users. |

### `device_sessions`

Tracks login/device sessions and possible device violations.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `device_sessions_delete_own` | DELETE | Users can delete their own device sessions. | Supports logout/session cleanup. |
| `device_sessions_insert_own` | INSERT | Users can create sessions only for themselves. | Prevents spoofed sessions for other users. |
| `device_sessions_select_admin` | SELECT | Admins can view device sessions. | Admin monitoring and incident review. |
| `device_sessions_select_own` | SELECT | Users can view their own sessions. | Lets users see current devices or session state. |
| `device_sessions_select_teacher` | SELECT | Teachers can view device session rows. | Supports teacher-side proctoring/monitoring flows. |
| `device_sessions_update_own` | UPDATE | Users can update their own session row. | Allows last-active/device metadata updates without cross-user writes. |

## Courses, Classes, Weeks, And Enrollments

### `courses`

Top-level course records owned by a teacher.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `courses_all_admin` | ALL | Admins can manage all courses. | Admin support and data correction. |
| `courses_all_teacher_own` | ALL | Teachers can manage courses where `teacher_id` is their user id. | Course ownership lives at the teacher level. |
| `courses_select_enrolled_student` | SELECT | Students can read courses where they are enrolled through a class. | Student dashboards need course context for assignments and materials. |

### `classes`

Class sections under a course.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `classes_all_admin` | ALL | Admins can manage all classes. | Admin support. |
| `classes_all_teacher_own` | ALL | Teachers can manage classes under their own courses. | Class ownership is inherited from the parent course. |
| `classes_select_enrolled_student` | SELECT | Students can read classes they are enrolled in. | Student views need class names, schedules, and assignment grouping. |

### `weeks`

Course/class weekly organization.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `weeks_all_admin` | ALL | Admins can manage all weeks. | Admin support. |
| `weeks_all_teacher_own` | ALL | Teachers can manage weeks for classes under their courses. | Teachers structure their class content by week. |
| `weeks_select_student` | SELECT | Students can read weeks for classes they are enrolled in. | Student assignment timelines need week context. |

### `enrollments`

Links students to classes.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `enrollments_all_admin` | ALL | Admins can manage all enrollments. | Admin roster management. |
| `enrollments_all_teacher_own` | ALL | Teachers can manage enrollments in their own classes. | Teachers maintain their class rosters. |
| `enrollments_select_own_student` | SELECT | Students can read their own enrollment rows. | Student dashboards and RLS checks need enrollment context. |

## Question Bank

### `tags`

Shared SAT subject/category labels.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `tags_all_admin` | ALL | Admins can manage tags. | Keeps taxonomy administration controlled. |
| `tags_select_authenticated` | SELECT | Any signed-in user can read tags. | Teachers and students need labels for question browsing/results. |

### `questions`

Question bank items created by teachers/admins and reused in assignments, exams, and exercises.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `questions_all_admin` | ALL | Admins can manage all questions. | Admin review and cleanup. |
| `questions_all_teacher_own` | ALL | Teachers can manage questions they created. | Preserves ownership over authored content. |
| `questions_select_all_teachers` | SELECT | Teachers/admins can read all questions. | Teachers need a shared question bank for assignment creation. |
| `questions_select_enrolled_student` | SELECT | Students can read questions included in published assignments for their enrolled classes. | Students should only see assigned content. |

### `question_options`

Multiple-choice options for questions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `question_options_all_admin` | ALL | Admins can manage all options. | Admin content correction. |
| `question_options_all_teacher_own` | ALL | Teachers can manage options for questions they created. | Question subrecords follow parent question ownership. |
| `question_options_select_all_teachers` | SELECT | Teachers/admins can read all options. | Required for building and reviewing assignments. |
| `question_options_select_enrolled_student` | SELECT | Students can read options for questions in published assignments for their classes. | Students need answer choices during assigned tests. |

### `question_accepted_answers`

Accepted text answers for short-answer questions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `question_accepted_answers_all_admin` | ALL | Admins can manage all accepted answers. | Admin content correction. |
| `question_accepted_answers_all_teacher_own` | ALL | Teachers can manage accepted answers for their own questions. | Keeps grading data attached to question ownership. |
| `question_accepted_answers_select_all_teachers` | SELECT | Teachers/admins can read accepted answers. | Teachers need answer keys while authoring/reviewing. |
| `question_accepted_answers_select_enrolled_student` | SELECT | Students can read accepted answers for questions in published assignments they can access. | This supports result/review flows where correct answers may be shown. |

### `question_tags`

Join table connecting questions to tags.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `question_tags_all_admin` | ALL | Admins can manage all question-tag links. | Admin taxonomy maintenance. |
| `question_tags_all_teacher_own` | ALL | Teachers can manage tags on their own questions. | Teachers classify and organize authored questions. |
| `question_tags_select_all_teachers` | SELECT | Teachers/admins can read all question-tag links. | Enables question bank filtering. |
| `question_tags_select_enrolled_student` | SELECT | Students can read tags for questions assigned to their enrolled classes. | Enables student result/category feedback. |

## Assignments

### `assignments`

Reusable assignment definitions created by teachers.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `assignments_all_admin` | ALL | Admins can manage all assignments. | Admin support. |
| `assignments_all_teacher_own` | ALL | Teachers can manage assignments they created. | Assignment author owns the editable definition. |
| `assignments_select_all_teachers` | SELECT | Teachers/admins can read all assignments. | Supports assignment reuse and teacher dashboards. |
| `assignments_select_enrolled_student` | SELECT | Students can read assignments that have published instances in their classes. | Students should see only assigned work. |

### `assignment_questions`

Join table between assignments and questions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `assignment_questions_all_admin` | ALL | Admins can manage all assignment-question links. | Admin correction. |
| `assignment_questions_all_teacher_own` | ALL | Teachers can manage links for assignments they created. | Assignment composition follows assignment ownership. |
| `assignment_questions_select_all_teachers` | SELECT | Teachers/admins can read all assignment-question links. | Required to preview and copy assignment structures. |
| `assignment_questions_select_enrolled_student` | SELECT | Students can read links for published assignment instances in their enrolled classes. | Students need the ordered question list for tests. |

### `assignment_instances`

Published instances of assignments for a specific class/week/deadline.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `assignment_instances_all_admin` | ALL | Admins can manage all instances. | Admin support. |
| `assignment_instances_all_teacher_own` | ALL | Teachers can manage instances for their own classes. | Publishing and scheduling are teacher-owned operations. |
| `assignment_instances_select_student` | SELECT | Students can read published instances for classes they are enrolled in. | Student assignment lists and test start flows depend on this. |

## Assigned Tests And Proctoring

### `submissions`

Student attempts for assigned tests.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `submissions_all_admin` | ALL | Admins can manage all submissions. | Admin remediation and support. |
| `submissions_insert_own_student` | INSERT | Students can create submissions only for themselves. | Prevents creating attempts for other students. |
| `submissions_select_own_student` | SELECT | Students can read their own submissions. | Test UI and result pages need attempt state. |
| `submissions_select_teacher_own` | SELECT | Teachers can read submissions for classes they teach. | Enables grading, analytics, and student progress review. |
| `submissions_update_own_student` | UPDATE | Students can update their own submissions only while `in_progress`. | Allows progress saving and submission updates while preventing edits after completion. |

### `submission_answers`

Student answers for assigned test submissions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `student can upsert own in-progress answers` | ALL | Students can read/write answers linked to their own `in_progress` submission. | Supports single-round-trip autosave/upsert for active tests. |
| `submission_answers_all_admin` | ALL | Admins can manage all answers. | Admin support and correction. |
| `submission_answers_insert_own_student` | INSERT | Students can insert answers for their own in-progress submissions. | Explicit insert rule for answer capture. |
| `submission_answers_select_own_student` | SELECT | Students can read answers for their own submissions. | Required for restoring progress and showing results. |
| `submission_answers_select_teacher_own` | SELECT | Teachers can read answers for submissions in their classes. | Required for grading/review. |
| `submission_answers_update_own_student` | UPDATE | Students can update answers for their own in-progress submissions. | Enables answer autosave while the test is active. |

Note: `student can upsert own in-progress answers` overlaps with the insert/update/select student policies. It was added to support an optimized autosave endpoint. This overlap is functional, but it can add RLS evaluation cost.

### `error_log`

Stores missed/error questions and student notes.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `error_log_all_admin` | ALL | Admins can manage all error log rows. | Admin support. |
| `error_log_insert_system` | INSERT | Allows system/trigger inserts. | Error log entries are generated automatically during grading. |
| `error_log_select_own_student` | SELECT | Students can read their own error log. | Student review and remediation. |
| `error_log_select_teacher_own` | SELECT | Teachers can read error logs for their class submissions. | Teacher review of student mistakes. |
| `error_log_update_note_own_student` | UPDATE | Students can update their own note fields. | Lets students annotate mistakes without editing others' logs. |

### `tab_switch_events`

Proctoring telemetry for assigned tests.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `tab_switch_events_all_admin` | ALL | Admins can manage all tab switch events. | Admin audit/support. |
| `tab_switch_events_insert_own_student` | INSERT | Students can insert telemetry for their own in-progress submission. | Captures proctoring events without exposing read access to students. |
| `tab_switch_events_select_teacher_own` | SELECT | Teachers can read events for submissions in their classes. | Supports teacher monitoring and violation review. |

## Class Library And Notifications

### `class_library_folders`

Folders for class materials.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `class_library_folders_all_admin` | ALL | Admins can manage all folders. | Admin support. |
| `class_library_folders_all_teacher_own` | ALL | Teachers can manage folders for their own classes. | Teachers curate class resources. |
| `class_library_folders_select_student` | SELECT | Students can read folders for enrolled classes. | Students access class learning materials. |

### `class_library_files`

Files or links inside class library folders.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `class_library_files_all_admin` | ALL | Admins can manage all files. | Admin support. |
| `class_library_files_all_teacher_own` | ALL | Teachers can manage files in folders for their own classes. | Teachers upload and maintain class materials. |
| `class_library_files_select_student` | SELECT | Students can read files for enrolled classes. | Students access class resources. |

### `notifications`

Class-level notifications sent by teachers/admins.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `notifications_all_admin` | ALL | Admins can manage all notifications. | Admin support. |
| `notifications_all_teacher_own` | ALL | Teachers can manage notifications for their classes. | Teachers communicate with their class roster. |
| `notifications_select_student` | SELECT | Students can read notifications for enrolled classes. | Students receive relevant class announcements. |

## Public And Free Exams

### `exam_papers`

Teacher/admin-created exam paper definitions, optionally public.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `exam_papers_delete_own_or_admin` | DELETE | Owners and admins can delete exam papers. | Preserves creator control while allowing admin cleanup. |
| `exam_papers_insert_teacher_admin` | INSERT | Teachers/admins can create exam papers. | Only staff roles author public/free test content. |
| `exam_papers_select` | SELECT | Anyone can read non-archived public papers; signed-in users can read non-archived papers. | Supports public/free test browsing while hiding archived papers. |
| `exam_papers_update_own_or_admin` | UPDATE | Owners and admins can update exam papers. | Lets authors maintain their exam papers. |

### `exam_paper_questions`

Join table between exam papers and questions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `epq_delete_owner_or_admin` | DELETE | Exam paper owners/admins can remove questions from papers. | Exam composition follows exam paper ownership. |
| `epq_insert_owner_or_admin` | INSERT | Exam paper owners/admins can add questions to papers. | Restricts authoring to owners/admins. |
| `epq_select` | SELECT | Users can read question links for non-archived papers if the paper is public or the user is signed in. | Enables rendering free/public exams. |

### `public_exam_attempts`

Attempts for public/free exams.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `public_exam_attempts_own_student` | ALL | Students can manage their own public exam attempts. | Free-test state belongs to the student. |
| `public_exam_attempts_teacher_read` | SELECT | Teachers/admins can read public exam attempts. | Enables staff review/analytics. |

### `public_exam_answers`

Answers for public/free exam attempts.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `public_exam_answers_own_student` | ALL | Students can manage answers for their own attempt; writes require the attempt to be `in_progress`. | Supports free-test autosave while preventing edits after completion. |
| `public_exam_answers_teacher_read` | SELECT | Teachers/admins can read public exam answers. | Enables review and analytics. |

## Exercises And Student Progress

### `exercises`

Practice exercise definitions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `exercises_manage_teacher` | ALL | Teachers/admins can manage exercises. | Staff create and maintain practice content. |
| `exercises_read_published` | SELECT | Anyone allowed by the API role can read published exercises. | Students can browse available practice exercises. |

### `exercise_questions`

Join table between exercises and questions.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `exercise_questions_manage_teacher` | ALL | Teachers/admins can manage exercise question links. | Staff compose practice exercises. |
| `exercise_questions_read` | SELECT | Users can read questions for published exercises; teachers/admins can also read unpublished exercise links. | Students can take published exercises while staff can preview drafts. |

### `exercise_attempts`

Student attempts for practice exercises.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `exercise_attempts_own` | ALL | Authenticated students can manage their own exercise attempts. | Attempt state is private to the student. |

### `exercise_answers`

Answers inside exercise attempts.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `exercise_answers_own` | ALL | Authenticated students can manage answers for their own attempts. | Keeps exercise answer data scoped to its owner. |

### `daily_activity`

Daily activity counters.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `daily_activity_own` | ALL | Authenticated students can manage their own daily activity rows. | Supports progress tracking without exposing other students' activity. |

### `student_streaks`

Student streak summaries.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `streaks_own` | ALL | Authenticated students can manage their own streak row. | Supports student progress widgets and motivation features. |

## Imports

### `file_imports`

Tracks uploaded files for question imports.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `file_imports_insert_teacher_admin` | INSERT | Teachers/admins can create import records for files they uploaded. | Limits import jobs to staff roles. |
| `file_imports_select_admin` | SELECT | Admins can read all imports. | Admin monitoring and support. |
| `file_imports_select_teacher_own` | SELECT | Teachers can read their own import records. | Teachers need import progress/status. |
| `file_imports_update_admin` | UPDATE | Admins can update any import. | Admin correction/retry support. |
| `file_imports_update_teacher_own` | UPDATE | Teachers/admins can update imports they uploaded. | Lets teachers review/edit their own import workflows. |

### `file_import_results`

Stores parsed/reviewed import payloads and errors.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `file_import_results_select_admin` | SELECT | Admins can read all import results. | Admin support and debugging. |
| `file_import_results_select_teacher_own` | SELECT | Teachers can read results for imports they uploaded. | Teachers review parsed questions and save errors. |

### `student_imports`

Tracks roster/student import jobs.

| Policy | Action | What it allows | Why we use it |
|---|---|---|---|
| `student_imports_select_admin` | SELECT | Admins can read all student import jobs. | Admin monitoring and support. |
| `student_imports_select_own` | SELECT | Teachers/admins can read student imports they requested. | Teachers need import status for their own roster uploads. |

## Operational Notes

### Why Policies Are Often Duplicated By Role

Many tables have separate admin, teacher, and student policies instead of one large policy. This keeps each access path understandable:

- Admins have broad operational access.
- Teachers are usually scoped by `created_by`, `teacher_id`, or class/course ownership.
- Students are usually scoped by `student_id` or enrollment.

The tradeoff is that permissive policies are ORed together. On heavily used tables, too many overlapping policies can increase planning/execution cost.

### Security Definer Helpers

The helper functions exist to avoid RLS recursion. For example, a policy on `profiles` cannot safely query `profiles` again without hitting recursive policy checks. `auth_user_role()` runs as the function owner and reads the role directly.

Keep these helpers small, stable, and narrowly focused. They should not expose broad data; they should return only authorization facts.

### Performance Follow-up

Supabase performance advisors reported RLS init-plan warnings because many policies currently call `auth.uid()` and `auth_user_role()` directly. The planned migration `supabase/migrations/00042_fix_rls_initplan_auth_calls.sql` rewrites these as scalar subselects, for example:

```sql
student_id = (select auth.uid())
```

and:

```sql
(select public.auth_user_role()) = 'admin'
```

This keeps the same authorization behavior while letting Postgres evaluate stable auth values once per statement where possible.

### Important Caution

Do not replace RLS with API-only authorization for user-owned data. API checks are useful defense in depth, but RLS is the database boundary that protects direct PostgREST/Supabase access.

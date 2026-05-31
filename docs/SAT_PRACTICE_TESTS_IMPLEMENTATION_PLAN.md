# SAT Practice Tests Implementation Plan

## Decision

Practice Tests must be a first-class SAT test feature.

They should not be treated as normal assignments with a few module labels attached.

The correct product model is:

```text
Practice Test created
  -> optionally public for self-practice
  -> optionally assigned to one or more classes
```

Public self-practice and class assignment are two separate visibility paths.

## Real SAT Structure

A full Digital SAT practice test has:

```text
Reading and Writing Module 1
Reading and Writing Module 2
10-minute break
Math Module 1
Math Module 2
```

Each module must be stored and delivered as a separate test module.

For a Reading and Writing only phase, use:

```text
Reading and Writing Module 1
Reading and Writing Module 2
```

Do not model this as:

```text
Module 1: Reading and Writing
Module 2: Math
```

That is not the real SAT structure.

## Current App State

### Practice Test Source Data

Current tables:

```text
exam_papers
exam_paper_questions
```

Current module field:

```text
exam_paper_questions.module_name
```

This is already the correct place to store SAT modules for Practice Tests.

Current module names:

```text
Reading & Writing Module 1
Reading & Writing Module 2
Math Module 1
Math Module 2
```

Recommended wording update later:

```text
Reading and Writing Module 1
Reading and Writing Module 2
Math Module 1
Math Module 2
```

### Public Self-Practice

Student page:

```text
/en/student/practice?tab=mock
```

Current logic:

```text
exam_papers.is_public = true
exam_papers.archived_at IS NULL
```

Public practice tests use:

```text
public_exam_attempts
public_exam_answers
```

This is self-practice only.

It is not assigned to a class.

### Class Mock Tests Today

Student page:

```text
/en/student/coursework?tab=mock
```

Current logic:

```text
assignment_instances.published_at IS NOT NULL
student is enrolled in assignment_instances.class_id
assignment has at least 2 distinct assignment_questions.module values
```

This is currently inferred from the assignment system.

This is not the target model for Practice Tests long term.

## Target Model

### Practice Test Creation

Teacher creates a Practice Test in the Practice Tests area.

The Practice Test owns:

- title
- source
- year
- description
- public self-practice toggle
- SAT module structure
- ordered questions per module

Data remains:

```text
exam_papers
exam_paper_questions
```

### Public Self-Practice Toggle

Field:

```text
exam_papers.is_public
```

Meaning:

```text
Show this Practice Test in /student/practice?tab=mock
```

Rules:

- `is_public = true`: available to students for self-practice.
- `is_public = false`: not visible in self-practice.
- This does not assign the test to any class.
- This does not create assignment rows.

### Assign Practice Test to Class

Teacher can assign an existing Practice Test to one or more classes.

Assignment settings should mirror the current class assignment flow:

- course
- class
- week
- deadline
- publish now / draft
- time settings
- retakes
- show results policy

But the assigned item should still reference the Practice Test, not copy it into normal assignment questions.

## Recommended Database Design

Add a dedicated class assignment table for Practice Tests:

```sql
CREATE TABLE public.practice_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_id UUID NOT NULL REFERENCES public.exam_papers(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  week_id UUID REFERENCES public.weeks(id) ON DELETE SET NULL,
  deadline TIMESTAMPTZ NOT NULL,
  is_timed BOOLEAN NOT NULL DEFAULT true,
  time_limit_seconds INTEGER,
  show_results public.show_results_type NOT NULL DEFAULT 'immediately',
  max_retakes INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Recommended indexes:

```sql
CREATE INDEX idx_practice_test_assignments_test_id ON public.practice_test_assignments(practice_test_id);
CREATE INDEX idx_practice_test_assignments_class_id ON public.practice_test_assignments(class_id);
CREATE INDEX idx_practice_test_assignments_week_id ON public.practice_test_assignments(week_id);
CREATE INDEX idx_practice_test_assignments_deadline ON public.practice_test_assignments(deadline);
CREATE INDEX idx_practice_test_assignments_published_at
  ON public.practice_test_assignments(published_at)
  WHERE published_at IS NOT NULL;
```

Recommended uniqueness rule:

```sql
CREATE UNIQUE INDEX idx_practice_test_assignments_unique_class_test
  ON public.practice_test_assignments(practice_test_id, class_id)
  WHERE published_at IS NOT NULL;
```

If teachers should be able to assign the same Practice Test to the same class multiple times in different weeks, use this instead:

```sql
CREATE UNIQUE INDEX idx_practice_test_assignments_unique_class_week_test
  ON public.practice_test_assignments(practice_test_id, class_id, week_id);
```

## Attempt Storage

Option A: reuse `public_exam_attempts`.

Not recommended because the name is public/self-practice specific and it currently references only `exam_paper_id`, not a class assignment.

=> My answer: Do not apply this

Option B: add dedicated assigned practice test attempt tables.

Recommended:

```text
practice_test_attempts
practice_test_answers
```

Suggested columns for attempts:

```sql
CREATE TABLE public.practice_test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_assignment_id UUID NOT NULL REFERENCES public.practice_test_assignments(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status public.submission_status NOT NULL DEFAULT 'in_progress',
  current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  current_module TEXT,
  raw_score NUMERIC,
  total_questions INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practice_test_assignment_id, student_id, attempt_number)
);
```

Suggested columns for answers:

```sql
CREATE TABLE public.practice_test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.practice_test_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
  answer_text TEXT,
  is_correct BOOLEAN,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
  highlight_data JSONB,
  note_text TEXT,
  strikethrough_data JSONB,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
```

## Why Not Copy Into Normal Assignments

Do not copy Practice Tests into:

```text
assignments
assignment_questions
assignment_instances
```

Reason:

- Assignments are normal homework/classwork.
- Practice Tests are SAT exam simulations.
- SAT tests need explicit modules, module transitions, later breaks, and possibly per-module timers.
- Copying into normal assignment tables makes the domain unclear and causes bugs like missing module names.

The class assignment UX can look like the existing assignment flow, but the data should be separate.

## Can We Remove `assignment_questions.module`?

### Current Answer

Not immediately.

The current code still reads `assignment_questions.module` in these places:

- `/student/coursework?tab=mock` uses it to decide whether an assignment is a mock test.
- `/student/test/[instanceId]` passes it into the test runner.
- `test-interface.tsx` groups assignment questions by module.
- Teacher assignment detail displays and searches module text.
- Admin backfill uses it as a subject hint.

If we drop the column now, those code paths will break.

### Target Answer

Yes, we can remove `assignment_questions.module` later if we complete the Practice Test separation.

Removal is safe only after:

1. Class mock tests no longer use `assignment_instances`.
2. `/student/coursework?tab=mock` reads `practice_test_assignments`, not assignment modules.
3. Assigned Practice Test runner reads `exam_paper_questions.module_name`.
4. Normal assignment runner stops grouping by `assignment_questions.module`.
5. Teacher assignment detail no longer displays/searches module.
6. Admin backfill no longer depends on `assignment_questions.module`.
7. Existing assignment rows with module values are migrated or intentionally discarded.

Then add a migration:

```sql
ALTER TABLE public.assignment_questions
DROP COLUMN module;
```

### Recommendation

Keep `assignment_questions.module` during the migration period.

Do not write new Practice Test logic that depends on it.

After Practice Tests have their own class assignment and attempt tables, remove the column in a cleanup migration.

## Routes

### Teacher

Practice Test list:

```text
/en/teacher/exam-papers
```

Keep this route for now to avoid breaking links.

Future route rename:

```text
/en/teacher/practice-tests
```

Create Practice Test:

```text
/en/teacher/exam-papers/new
```

Practice Test detail:

```text
/en/teacher/exam-papers/[id]
```

Assign to class:

```text
/en/teacher/exam-papers/[id]/assign
```

or modal from the detail page.

### Student

Self-practice:

```text
/en/student/practice?tab=mock
```

Class-assigned practice tests:

```text
/en/student/coursework?tab=mock
```

Take class-assigned practice test:

```text
/en/student/practice-tests/assigned/[assignmentId]
```

or keep the current test UI component and mount it from a new route.

## API Plan

### Public Self-Practice

Keep existing behavior:

```text
GET /student/practice?tab=mock
```

Query:

```text
exam_papers.is_public = true
```

### Assign Practice Test

Add:

```text
POST /api/practice-tests/[id]/assign
```

Body:

```json
{
  "targets": [
    {
      "class_id": "uuid",
      "week_id": "uuid"
    }
  ],
  "deadline": "2026-06-15T12:00:00.000Z",
  "is_timed": true,
  "time_limit_seconds": 8040,
  "show_results": "immediately",
  "max_retakes": 1,
  "published_at": "2026-05-31T08:00:00.000Z"
}
```

Server rules:

1. Teacher must own the Practice Test or be admin.
2. Teacher must own every target class or be admin.
3. Practice Test must have at least two modules for Reading and Writing only, or four modules for full SAT.
4. Each required module must contain at least one question.
5. Insert one `practice_test_assignments` row per target.
6. Do not modify `assignments` or `assignment_questions`.

### Assigned Practice Test Attempts

Add:

```text
POST /api/practice-test-assignments/[id]/attempts
PATCH /api/practice-test-attempts/[id]
POST /api/practice-test-attempts/[id]/answers
POST /api/practice-test-attempts/[id]/submit
```

These can reuse the current `TestInterface` component by passing different endpoints, similar to the current public free-test flow.

## Student Runner Rules

The runner must load modules from:

```text
exam_paper_questions.module_name
```

Required order:

```text
Reading and Writing Module 1
Reading and Writing Module 2
Math Module 1
Math Module 2
```

Rules:

- Student starts in Reading and Writing Module 1.
- Student can navigate only within the current module.
- End of module shows check-work.
- After moving forward, the previous module is locked.
- After Reading and Writing Module 2, show a break screen before Math Module 1.
- Submission occurs after final module.

Phase 1 can skip the break if we only support Reading and Writing modules.

## RLS Plan

Enable RLS on new tables:

```text
practice_test_assignments
practice_test_attempts
practice_test_answers
```

Policies:

- Teachers can manage assignments for classes they own.
- Admin can manage all rows.
- Students can read published practice test assignments only for enrolled classes.
- Students can create/read/update their own attempts for assigned tests.
- Students cannot access assignments for classes they are not enrolled in.
- Students cannot access draft assignments.

Use ownership checks through `classes -> courses.teacher_id` for teachers.

Use `enrollments.class_id` for student access.

## Implementation Steps

1. Keep Practice Test creation on `exam_papers` and `exam_paper_questions`.
2. Add explicit SAT module ordering helper.
3. Add `practice_test_assignments` migration and RLS.
4. Add `practice_test_attempts` and `practice_test_answers` migration and RLS.
5. Add assign-to-class API for Practice Tests.
6. Add teacher assign modal/page from Practice Test detail.
7. Update `/student/coursework?tab=mock` to read `practice_test_assignments`.
8. Add assigned Practice Test take route using `TestInterface`.
9. Add assigned Practice Test submit/grading endpoints.
10. Stop treating normal assignments as mock tests based on `assignment_questions.module`.
11. Verify public self-practice still reads only `is_public`.
12. After migration, remove old mock-test inference from assignments.
13. Only then consider dropping `assignment_questions.module`.

## Acceptance Criteria

### Teacher

- Teacher creates a Practice Test with SAT modules.
- Teacher can mark it public for self-practice.
- Teacher can assign it to one or more classes.
- Teacher can save assignment as draft.
- Teacher can publish assignment to students.
- Teacher can see assigned class, week, deadline, and publish state.

### Student Self-Practice

- Student sees only public Practice Tests in `/student/practice?tab=mock`.
- Student does not need class enrollment for public self-practice.
- Student attempts are stored separately from class-assigned attempts.

### Student Class Mock Test

- Student sees assigned Practice Tests in `/student/coursework?tab=mock`.
- Student sees only tests for classes they are enrolled in.
- Draft assigned Practice Tests are hidden.
- Student takes the test module by module.
- Student cannot access previous module after moving forward.
- Results work for assigned Practice Tests.

### Database

- Public visibility is controlled only by `exam_papers.is_public`.
- Class assignment is controlled only by `practice_test_assignments.published_at`.
- Practice Test module structure is controlled by `exam_paper_questions.module_name`.
- Normal assignment questions do not need SAT module data after the migration.


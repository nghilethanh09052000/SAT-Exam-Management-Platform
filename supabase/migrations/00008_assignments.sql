-- Migration: 00008_assignments.sql
-- assignments, assignment_questions, assignment_instances

-- ─── ASSIGNMENTS ───────────────────────────────────────────────────────────

CREATE TABLE public.assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title        TEXT NOT NULL,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_created_by ON public.assignments(created_by);
CREATE INDEX idx_assignments_archived_at ON public.assignments(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD their own assignments
CREATE POLICY "assignments_all_teacher_own"
  ON public.assignments
  FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- All teachers can read all assignments (shared bank)
CREATE POLICY "assignments_select_all_teachers"
  ON public.assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "assignments_all_admin"
  ON public.assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── ASSIGNMENT_QUESTIONS ──────────────────────────────────────────────────

CREATE TABLE public.assignment_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  "order"        INTEGER NOT NULL DEFAULT 0,
  score_weight   NUMERIC NOT NULL DEFAULT 1,
  module         TEXT NOT NULL DEFAULT '',  -- e.g. "Reading & Writing Module 1"
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, question_id)
);

CREATE INDEX idx_assignment_questions_assignment_id ON public.assignment_questions(assignment_id);
CREATE INDEX idx_assignment_questions_question_id ON public.assignment_questions(question_id);

ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;

-- Teachers can manage assignment_questions for their own assignments
CREATE POLICY "assignment_questions_all_teacher_own"
  ON public.assignment_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.id = assignment_questions.assignment_id
        AND a.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.id = assignment_questions.assignment_id
        AND a.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- All teachers can read
CREATE POLICY "assignment_questions_select_all_teachers"
  ON public.assignment_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "assignment_questions_all_admin"
  ON public.assignment_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── ASSIGNMENT_INSTANCES ──────────────────────────────────────────────────

CREATE TABLE public.assignment_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       UUID NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  class_id            UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  week_id             UUID NOT NULL REFERENCES public.weeks(id) ON DELETE RESTRICT,
  deadline            TIMESTAMPTZ NOT NULL,
  is_timed            BOOLEAN NOT NULL DEFAULT true,
  time_limit_seconds  INTEGER,   -- NULL if untimed
  show_results        public.show_results_type NOT NULL DEFAULT 'immediately',
  shuffle_questions   BOOLEAN NOT NULL DEFAULT false,
  shuffle_options     BOOLEAN NOT NULL DEFAULT false,
  max_retakes         INTEGER NOT NULL DEFAULT 0,
  alert_enabled       BOOLEAN NOT NULL DEFAULT true,
  published_at        TIMESTAMPTZ,  -- NULL = draft
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignment_instances_assignment_id ON public.assignment_instances(assignment_id);
CREATE INDEX idx_assignment_instances_class_id ON public.assignment_instances(class_id);
CREATE INDEX idx_assignment_instances_week_id ON public.assignment_instances(week_id);
CREATE INDEX idx_assignment_instances_deadline ON public.assignment_instances(deadline);
CREATE INDEX idx_assignment_instances_published_at ON public.assignment_instances(published_at) WHERE published_at IS NOT NULL;

ALTER TABLE public.assignment_instances ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD instances in their own classes
CREATE POLICY "assignment_instances_all_teacher_own"
  ON public.assignment_instances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "assignment_instances_all_admin"
  ON public.assignment_instances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Student can read published instances for their enrolled class only
CREATE POLICY "assignment_instances_select_student"
  ON public.assignment_instances
  FOR SELECT
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.class_id = assignment_instances.class_id
    )
  );

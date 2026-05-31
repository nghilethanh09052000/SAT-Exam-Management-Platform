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

CREATE INDEX idx_practice_test_assignments_test_id ON public.practice_test_assignments(practice_test_id);
CREATE INDEX idx_practice_test_assignments_class_id ON public.practice_test_assignments(class_id);
CREATE INDEX idx_practice_test_assignments_week_id ON public.practice_test_assignments(week_id);
CREATE INDEX idx_practice_test_assignments_deadline ON public.practice_test_assignments(deadline);
CREATE INDEX idx_practice_test_assignments_published_at
  ON public.practice_test_assignments(published_at)
  WHERE published_at IS NOT NULL;
CREATE UNIQUE INDEX idx_practice_test_assignments_unique_class_week_test
  ON public.practice_test_assignments(practice_test_id, class_id, week_id);

CREATE TABLE public.practice_test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_assignment_id UUID NOT NULL REFERENCES public.practice_test_assignments(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status public.submission_status NOT NULL DEFAULT 'in_progress',
  current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  current_module TEXT,
  raw_score INTEGER,
  total_questions INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practice_test_assignment_id, student_id, attempt_number)
);

CREATE INDEX idx_practice_test_attempts_assignment_id ON public.practice_test_attempts(practice_test_assignment_id);
CREATE INDEX idx_practice_test_attempts_student_id ON public.practice_test_attempts(student_id);
CREATE INDEX idx_practice_test_attempts_status ON public.practice_test_attempts(status);

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

CREATE INDEX idx_practice_test_answers_attempt_id ON public.practice_test_answers(attempt_id);
CREATE INDEX idx_practice_test_answers_question_id ON public.practice_test_answers(question_id);
CREATE INDEX idx_practice_test_answers_selected_option_id ON public.practice_test_answers(selected_option_id);
CREATE INDEX idx_practice_test_answers_is_correct ON public.practice_test_answers(is_correct);

CREATE TRIGGER set_updated_at_practice_test_assignments
  BEFORE UPDATE ON public.practice_test_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_practice_test_attempts
  BEFORE UPDATE ON public.practice_test_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_practice_test_answers
  BEFORE UPDATE ON public.practice_test_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.practice_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_test_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "practice_test_assignments_teacher_manage"
  ON public.practice_test_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes cl
      JOIN public.courses co ON co.id = cl.course_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE cl.id = practice_test_assignments.class_id
        AND p.role IN ('teacher', 'admin')
        AND (co.teacher_id = (select auth.uid()) OR p.role = 'admin')
    )
  )
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.classes cl
      JOIN public.courses co ON co.id = cl.course_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE cl.id = practice_test_assignments.class_id
        AND p.role IN ('teacher', 'admin')
        AND (co.teacher_id = (select auth.uid()) OR p.role = 'admin')
    )
  );

CREATE POLICY "practice_test_assignments_student_select"
  ON public.practice_test_assignments
  FOR SELECT
  TO authenticated
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.enrollments e
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE e.class_id = practice_test_assignments.class_id
        AND e.student_id = (select auth.uid())
        AND p.role = 'student'
    )
  );

CREATE POLICY "practice_test_attempts_student_select"
  ON public.practice_test_attempts
  FOR SELECT
  TO authenticated
  USING (student_id = (select auth.uid()));

CREATE POLICY "practice_test_attempts_student_insert"
  ON public.practice_test_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.practice_test_assignments pta
      JOIN public.enrollments e ON e.class_id = pta.class_id
      WHERE pta.id = practice_test_attempts.practice_test_assignment_id
        AND pta.published_at IS NOT NULL
        AND pta.deadline > now()
        AND e.student_id = (select auth.uid())
    )
  );

CREATE POLICY "practice_test_attempts_student_update"
  ON public.practice_test_attempts
  FOR UPDATE
  TO authenticated
  USING (student_id = (select auth.uid()) AND status = 'in_progress')
  WITH CHECK (student_id = (select auth.uid()));

CREATE POLICY "practice_test_attempts_teacher_select"
  ON public.practice_test_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practice_test_assignments pta
      JOIN public.classes cl ON cl.id = pta.class_id
      JOIN public.courses co ON co.id = cl.course_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE pta.id = practice_test_attempts.practice_test_assignment_id
        AND p.role IN ('teacher', 'admin')
        AND (co.teacher_id = (select auth.uid()) OR p.role = 'admin')
    )
  );

CREATE POLICY "practice_test_answers_student_select"
  ON public.practice_test_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practice_test_attempts a
      WHERE a.id = practice_test_answers.attempt_id
        AND a.student_id = (select auth.uid())
    )
  );

CREATE POLICY "practice_test_answers_student_insert"
  ON public.practice_test_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practice_test_attempts a
      WHERE a.id = practice_test_answers.attempt_id
        AND a.student_id = (select auth.uid())
        AND a.status = 'in_progress'
    )
  );

CREATE POLICY "practice_test_answers_student_update"
  ON public.practice_test_answers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practice_test_attempts a
      WHERE a.id = practice_test_answers.attempt_id
        AND a.student_id = (select auth.uid())
        AND a.status = 'in_progress'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practice_test_attempts a
      WHERE a.id = practice_test_answers.attempt_id
        AND a.student_id = (select auth.uid())
        AND a.status = 'in_progress'
    )
  );

CREATE POLICY "practice_test_answers_teacher_select"
  ON public.practice_test_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practice_test_attempts a
      JOIN public.practice_test_assignments pta ON pta.id = a.practice_test_assignment_id
      JOIN public.classes cl ON cl.id = pta.class_id
      JOIN public.courses co ON co.id = cl.course_id
      JOIN public.profiles p ON p.id = (select auth.uid())
      WHERE a.id = practice_test_answers.attempt_id
        AND p.role IN ('teacher', 'admin')
        AND (co.teacher_id = (select auth.uid()) OR p.role = 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_test_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.practice_test_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.practice_test_answers TO authenticated;

ALTER TABLE public.assignment_questions
  DROP COLUMN IF EXISTS module;

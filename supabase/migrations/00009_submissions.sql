-- Migration: 00009_submissions.sql
-- submissions, submission_answers, error_log, tab_switch_events

-- ─── SUBMISSIONS ───────────────────────────────────────────────────────────

CREATE TABLE public.submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id         UUID NOT NULL REFERENCES public.assignment_instances(id) ON DELETE RESTRICT,
  student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  status              public.submission_status NOT NULL DEFAULT 'in_progress',
  raw_score           INTEGER,
  scaled_score        INTEGER,
  total_questions     INTEGER,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  time_spent_seconds  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, student_id, attempt_number)
);

CREATE INDEX idx_submissions_instance_id ON public.submissions(instance_id);
CREATE INDEX idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX idx_submissions_status ON public.submissions(status);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Student can read their own submissions
CREATE POLICY "submissions_select_own_student"
  ON public.submissions
  FOR SELECT
  USING (student_id = auth.uid());

-- Student can insert their own submissions
CREATE POLICY "submissions_insert_own_student"
  ON public.submissions
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Student can update their own in-progress submissions
CREATE POLICY "submissions_update_own_student"
  ON public.submissions
  FOR UPDATE
  USING (
    student_id = auth.uid()
    AND status = 'in_progress'
  );

-- Teacher can read submissions for their own classes
CREATE POLICY "submissions_select_teacher_own"
  ON public.submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_instances ai
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE ai.id = submissions.instance_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "submissions_all_admin"
  ON public.submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── SUBMISSION_ANSWERS ────────────────────────────────────────────────────

CREATE TABLE public.submission_answers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  question_id           UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  selected_option_id    UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
  answer_text           TEXT,
  is_correct            BOOLEAN,
  is_marked_for_review  BOOLEAN NOT NULL DEFAULT false,
  highlight_data        JSONB,
  note_text             TEXT,
  strikethrough_data    JSONB,
  time_spent_seconds    INTEGER,
  answered_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);

CREATE INDEX idx_submission_answers_submission_id ON public.submission_answers(submission_id);
CREATE INDEX idx_submission_answers_question_id ON public.submission_answers(question_id);
CREATE INDEX idx_submission_answers_is_correct ON public.submission_answers(is_correct);

ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;

-- Student can read/write their own answers (only during active submission)
CREATE POLICY "submission_answers_select_own_student"
  ON public.submission_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = auth.uid()
    )
  );

CREATE POLICY "submission_answers_insert_own_student"
  ON public.submission_answers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  );

CREATE POLICY "submission_answers_update_own_student"
  ON public.submission_answers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  );

-- Teacher can read answers for their own class submissions
CREATE POLICY "submission_answers_select_teacher_own"
  ON public.submission_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = submission_answers.submission_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "submission_answers_all_admin"
  ON public.submission_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── ERROR_LOG ─────────────────────────────────────────────────────────────

CREATE TABLE public.error_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submission_id  UUID NOT NULL REFERENCES public.submissions(id) ON DELETE RESTRICT,
  question_id    UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  student_note   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_log_student_id ON public.error_log(student_id);
CREATE INDEX idx_error_log_submission_id ON public.error_log(submission_id);
CREATE INDEX idx_error_log_question_id ON public.error_log(question_id);

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

-- Student can read their own error log
CREATE POLICY "error_log_select_own_student"
  ON public.error_log
  FOR SELECT
  USING (student_id = auth.uid());

-- Student can update only their student_note
CREATE POLICY "error_log_update_note_own_student"
  ON public.error_log
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teacher can read error log entries for their own class students
CREATE POLICY "error_log_select_teacher_own"
  ON public.error_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = error_log.submission_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "error_log_all_admin"
  ON public.error_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Allow inserts from trigger (auto_populate_error_log runs as postgres role)
CREATE POLICY "error_log_insert_system"
  ON public.error_log
  FOR INSERT
  WITH CHECK (true);  -- trigger inserts are done with service role

-- ─── TAB_SWITCH_EVENTS ─────────────────────────────────────────────────────

CREATE TABLE public.tab_switch_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type     public.tab_event_type NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tab_switch_events_submission_id ON public.tab_switch_events(submission_id);
CREATE INDEX idx_tab_switch_events_student_id ON public.tab_switch_events(student_id);

ALTER TABLE public.tab_switch_events ENABLE ROW LEVEL SECURITY;

-- Students cannot read this table — no SELECT policy for students

-- Student can INSERT their own tab switch events
CREATE POLICY "tab_switch_events_insert_own_student"
  ON public.tab_switch_events
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = tab_switch_events.submission_id
        AND s.student_id = auth.uid()
        AND s.status = 'in_progress'
    )
  );

-- Teacher can read events for their own class submissions
CREATE POLICY "tab_switch_events_select_teacher_own"
  ON public.tab_switch_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = tab_switch_events.submission_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "tab_switch_events_all_admin"
  ON public.tab_switch_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

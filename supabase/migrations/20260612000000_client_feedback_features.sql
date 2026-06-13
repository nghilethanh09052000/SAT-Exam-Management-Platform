-- Client feedback batch (2026-06-12):
-- 1. Assignment instance settings: start time, resume toggle, granular
--    score/answer visibility policies.
-- 2. Per-answer student confidence (high/medium/low).
-- 3. Per-student deadline extensions.
-- 4. Teacher-configurable performance status thresholds for the dashboard.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Assignment instance settings
-- ────────────────────────────────────────────────────────────────────────────

-- Score visibility: when a student may see their score.
--   on_submit          → as soon as they finish (or partially: answered subset)
--   after_all_students → once every enrolled student has submitted
--   after_deadline     → once the deadline has passed
CREATE TYPE public.score_visibility_type AS ENUM (
  'on_submit', 'on_partial', 'after_all_students', 'after_deadline'
);

-- Answer/explanation visibility: same options + unlock at a score threshold.
CREATE TYPE public.answer_visibility_type AS ENUM (
  'on_submit', 'on_partial', 'after_all_students', 'after_deadline', 'after_score_threshold'
);

ALTER TABLE public.assignment_instances
  ADD COLUMN start_at                    TIMESTAMPTZ,                -- NULL = open immediately
  ADD COLUMN allow_resume                BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN score_visibility            public.score_visibility_type NOT NULL DEFAULT 'on_submit',
  ADD COLUMN answer_visibility           public.answer_visibility_type NOT NULL DEFAULT 'on_submit',
  ADD COLUMN answer_visibility_threshold NUMERIC
    CHECK (answer_visibility_threshold IS NULL
           OR (answer_visibility_threshold >= 0 AND answer_visibility_threshold <= 100));

-- Backfill from the legacy show_results flag so existing behavior is kept.
UPDATE public.assignment_instances
SET score_visibility = 'after_deadline', answer_visibility = 'after_deadline'
WHERE show_results = 'after_deadline';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Student confidence per answer
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.submission_answers
  ADD COLUMN confidence TEXT
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'));

-- Replace the autosave RPC so the runner can persist confidence. The old
-- signature is dropped first: an overload would make PostgREST calls ambiguous.
DROP FUNCTION IF EXISTS public.upsert_submission_answer(
  UUID, UUID, UUID, TEXT, BOOLEAN, JSONB, TEXT, JSONB, INTEGER
);

CREATE OR REPLACE FUNCTION public.upsert_submission_answer(
  p_submission_id UUID,
  p_question_id UUID,
  p_selected_option_id UUID DEFAULT NULL,
  p_answer_text TEXT DEFAULT NULL,
  p_is_marked_for_review BOOLEAN DEFAULT false,
  p_highlight_data JSONB DEFAULT NULL,
  p_note_text TEXT DEFAULT NULL,
  p_strikethrough_data JSONB DEFAULT NULL,
  p_time_spent_seconds INTEGER DEFAULT NULL,
  p_confidence TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  question_id UUID,
  changed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_student_id UUID := auth.uid();
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_confidence IS NOT NULL AND p_confidence NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid confidence value' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = p_submission_id
      AND s.student_id = v_student_id
      AND s.status = 'in_progress'::public.submission_status
  ) THEN
    RAISE EXCEPTION 'Submission not found or already completed' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  INSERT INTO public.submission_answers (
    submission_id,
    question_id,
    selected_option_id,
    answer_text,
    is_marked_for_review,
    highlight_data,
    note_text,
    strikethrough_data,
    time_spent_seconds,
    confidence,
    answered_at,
    updated_at
  )
  VALUES (
    p_submission_id,
    p_question_id,
    p_selected_option_id,
    p_answer_text,
    coalesce(p_is_marked_for_review, false),
    p_highlight_data,
    p_note_text,
    p_strikethrough_data,
    p_time_spent_seconds,
    p_confidence,
    now(),
    now()
  )
  ON CONFLICT (submission_id, question_id)
  DO UPDATE SET
    selected_option_id = EXCLUDED.selected_option_id,
    answer_text = EXCLUDED.answer_text,
    is_marked_for_review = EXCLUDED.is_marked_for_review,
    highlight_data = EXCLUDED.highlight_data,
    note_text = EXCLUDED.note_text,
    strikethrough_data = EXCLUDED.strikethrough_data,
    time_spent_seconds = EXCLUDED.time_spent_seconds,
    confidence = EXCLUDED.confidence,
    answered_at = EXCLUDED.answered_at,
    updated_at = EXCLUDED.updated_at
  WHERE
    submission_answers.selected_option_id IS DISTINCT FROM EXCLUDED.selected_option_id
    OR submission_answers.answer_text IS DISTINCT FROM EXCLUDED.answer_text
    OR submission_answers.is_marked_for_review IS DISTINCT FROM EXCLUDED.is_marked_for_review
    OR submission_answers.highlight_data IS DISTINCT FROM EXCLUDED.highlight_data
    OR submission_answers.note_text IS DISTINCT FROM EXCLUDED.note_text
    OR submission_answers.strikethrough_data IS DISTINCT FROM EXCLUDED.strikethrough_data
    OR submission_answers.time_spent_seconds IS DISTINCT FROM EXCLUDED.time_spent_seconds
    OR submission_answers.confidence IS DISTINCT FROM EXCLUDED.confidence
  RETURNING
    submission_answers.id,
    submission_answers.question_id,
    true;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sa.id, sa.question_id, false
  FROM public.submission_answers sa
  WHERE sa.submission_id = p_submission_id
    AND sa.question_id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_submission_answer(
  UUID, UUID, UUID, TEXT, BOOLEAN, JSONB, TEXT, JSONB, INTEGER, TEXT
) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Per-student deadline extensions
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.assignment_extensions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        UUID NOT NULL REFERENCES public.assignment_instances(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  extended_deadline  TIMESTAMPTZ NOT NULL,
  note               TEXT,
  created_by         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, student_id)
);

CREATE INDEX idx_assignment_extensions_instance ON public.assignment_extensions(instance_id);
CREATE INDEX idx_assignment_extensions_student ON public.assignment_extensions(student_id);

ALTER TABLE public.assignment_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_extensions_select_own_student"
  ON public.assignment_extensions
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "assignment_extensions_all_teacher_own"
  ON public.assignment_extensions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_instances ai
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE ai.id = assignment_extensions.instance_id
        AND co.teacher_id = (SELECT auth.uid())
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignment_instances ai
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE ai.id = assignment_extensions.instance_id
        AND co.teacher_id = (SELECT auth.uid())
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "assignment_extensions_all_admin"
  ON public.assignment_extensions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- The attempt-creation RPC honors extensions and the new start_at gate.
CREATE OR REPLACE FUNCTION public.create_submission_attempt(p_instance_id UUID)
RETURNS TABLE (
  id UUID,
  instance_id UUID,
  attempt_number INTEGER,
  status public.submission_status,
  started_at TIMESTAMPTZ,
  current_question_id UUID,
  current_module TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_instance RECORD;
  v_attempt_count INTEGER;
  v_effective_deadline TIMESTAMPTZ;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::TEXT || ':' || v_student_id::TEXT, 0));

  SELECT ai.id, ai.deadline, ai.max_retakes, ai.published_at, ai.class_id, ai.start_at
  INTO v_instance
  FROM public.assignment_instances ai
  WHERE ai.id = p_instance_id;

  IF NOT FOUND OR v_instance.published_at IS NULL THEN
    RAISE EXCEPTION 'Assignment instance not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_instance.start_at IS NOT NULL AND v_instance.start_at > now() THEN
    RAISE EXCEPTION 'Assignment has not opened yet' USING ERRCODE = 'P0001';
  END IF;

  -- Per-student extension overrides the class deadline when later.
  SELECT GREATEST(
    v_instance.deadline,
    COALESCE(
      (SELECT ae.extended_deadline
       FROM public.assignment_extensions ae
       WHERE ae.instance_id = p_instance_id AND ae.student_id = v_student_id),
      v_instance.deadline
    )
  )
  INTO v_effective_deadline;

  IF v_effective_deadline <= now() THEN
    RAISE EXCEPTION 'Assignment deadline has passed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.profiles p ON p.id = v_student_id
    WHERE e.class_id = v_instance.class_id
      AND e.student_id = v_student_id
      AND p.role = 'student'
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Assignment instance not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.submissions s
  WHERE s.instance_id = p_instance_id
    AND s.student_id = v_student_id;

  IF v_attempt_count >= (v_instance.max_retakes + 1) THEN
    RAISE EXCEPTION 'Retake limit reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  INSERT INTO public.submissions (
    instance_id,
    student_id,
    attempt_number,
    status,
    started_at
  )
  VALUES (
    p_instance_id,
    v_student_id,
    v_attempt_count + 1,
    'in_progress',
    now()
  )
  RETURNING
    submissions.id,
    submissions.instance_id,
    submissions.attempt_number,
    submissions.status,
    submissions.started_at,
    submissions.current_question_id,
    submissions.current_module;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Teacher-configurable performance status thresholds
-- ────────────────────────────────────────────────────────────────────────────

-- Accuracy >= excellent_pct  → "Vượt mục tiêu"
-- Accuracy >= target_pct     → "Đạt mục tiêu"
-- Accuracy >= watch_pct      → "Cần theo dõi"
-- below watch_pct            → "Nguy hiểm"
CREATE TABLE public.performance_thresholds (
  teacher_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  excellent_pct  NUMERIC NOT NULL DEFAULT 85 CHECK (excellent_pct BETWEEN 0 AND 100),
  target_pct     NUMERIC NOT NULL DEFAULT 70 CHECK (target_pct BETWEEN 0 AND 100),
  watch_pct      NUMERIC NOT NULL DEFAULT 50 CHECK (watch_pct BETWEEN 0 AND 100),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (excellent_pct >= target_pct AND target_pct >= watch_pct)
);

ALTER TABLE public.performance_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_thresholds_all_own"
  ON public.performance_thresholds
  FOR ALL
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY "performance_thresholds_all_admin"
  ON public.performance_thresholds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

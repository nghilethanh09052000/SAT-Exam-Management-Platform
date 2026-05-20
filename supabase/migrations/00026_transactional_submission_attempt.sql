-- Migration: 00026_transactional_submission_attempt.sql
-- Create submissions behind a transaction-scoped lock so concurrent starts cannot exceed retake limits.

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
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::TEXT || ':' || v_student_id::TEXT, 0));

  SELECT ai.id, ai.deadline, ai.max_retakes, ai.published_at, ai.class_id
  INTO v_instance
  FROM public.assignment_instances ai
  WHERE ai.id = p_instance_id;

  IF NOT FOUND OR v_instance.published_at IS NULL THEN
    RAISE EXCEPTION 'Assignment instance not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_instance.deadline <= now() THEN
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

REVOKE ALL ON FUNCTION public.create_submission_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_submission_attempt(UUID) TO authenticated;

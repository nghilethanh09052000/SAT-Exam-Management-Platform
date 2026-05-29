-- Migration: 20260529000000_fix_upsert_answer_ambiguous.sql
--
-- Fix: public.upsert_submission_answer failed at runtime with
--   "column reference \"question_id\" is ambiguous"
--
-- Cause: the function's RETURNS TABLE OUT parameter `question_id` collides
-- with the `submission_answers.question_id` column inside the
-- `ON CONFLICT (submission_id, question_id)` inference clause. By default
-- plpgsql treats such a collision as an error.
--
-- Fix: add the `#variable_conflict use_column` directive so ambiguous
-- identifiers inside embedded SQL resolve to the table column (the intended
-- target), not the OUT variable. Output column names are preserved so the
-- /api/submission-answers route keeps reading `data.id` / `data.question_id`.

CREATE OR REPLACE FUNCTION public.upsert_submission_answer(
  p_submission_id UUID,
  p_question_id UUID,
  p_selected_option_id UUID DEFAULT NULL,
  p_answer_text TEXT DEFAULT NULL,
  p_is_marked_for_review BOOLEAN DEFAULT false,
  p_highlight_data JSONB DEFAULT NULL,
  p_note_text TEXT DEFAULT NULL,
  p_strikethrough_data JSONB DEFAULT NULL,
  p_time_spent_seconds INTEGER DEFAULT NULL
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
  RETURNING
    submission_answers.id,
    submission_answers.question_id,
    true;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sa.id,
    sa.question_id,
    false
  FROM public.submission_answers sa
  WHERE sa.submission_id = p_submission_id
    AND sa.question_id = p_question_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_submission_answer(UUID, UUID, UUID, TEXT, BOOLEAN, JSONB, TEXT, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_submission_answer(UUID, UUID, UUID, TEXT, BOOLEAN, JSONB, TEXT, JSONB, INTEGER) TO authenticated;

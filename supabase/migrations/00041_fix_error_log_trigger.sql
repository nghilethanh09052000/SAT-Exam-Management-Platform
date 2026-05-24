-- Migration: 00041_fix_error_log_trigger.sql
--
-- Problem: auto_populate_error_log fires FOR EACH ROW.
-- When runGradeSubmissionJob upserts all N answers in one statement,
-- Postgres fires the trigger once per wrong-answer row. Each invocation runs:
--   SELECT student_id FROM submissions WHERE id = NEW.submission_id  ← same row every time
--   INSERT INTO error_log ... ON CONFLICT DO NOTHING
--
-- For a 44-question SAT test with ~20 wrong answers that is 40 extra SQL
-- round-trips hidden inside what looks like a single upsert call.
--
-- Fix: convert to FOR EACH STATEMENT with transition tables. Postgres passes
-- all affected rows to one trigger invocation. The new function does a single
-- JOIN + bulk INSERT regardless of how many wrong answers exist — O(1) queries
-- instead of O(n).
--
-- Transition tables cannot be used on a trigger with more than one event, so
-- INSERT and UPDATE must be separate triggers. UPDATE transition tables also
-- cannot be used with an UPDATE OF column list, so the function filters rows
-- where is_correct actually changed.
--
-- Requires PostgreSQL ≥ 10 (Supabase runs 15+, no compatibility concern).

-- ── 1. Replace the function ───────────────────────────────────────────────────
-- Statement-level triggers must return NULL, not NEW.

CREATE OR REPLACE FUNCTION public.auto_populate_error_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Single JOIN resolves student_id for every affected row at once,
    -- then bulk-inserts all wrong answers into error_log in one statement.
    INSERT INTO public.error_log (student_id, submission_id, question_id)
    SELECT s.student_id, n.submission_id, n.question_id
    FROM   new_rows n
    JOIN   public.submissions s ON s.id = n.submission_id
    WHERE  n.is_correct IS DISTINCT FROM true
      AND  n.is_correct IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.error_log (student_id, submission_id, question_id)
    SELECT s.student_id, n.submission_id, n.question_id
    FROM   new_rows n
    JOIN   old_rows o ON o.id = n.id
    JOIN   public.submissions s ON s.id = n.submission_id
    WHERE  n.is_correct IS DISTINCT FROM true
      AND  n.is_correct IS NOT NULL
      AND  n.is_correct IS DISTINCT FROM o.is_correct
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;  -- required for FOR EACH STATEMENT triggers
END;
$$;

-- ── 2. Replace the trigger ────────────────────────────────────────────────────
-- Drop the old per-row trigger, create new per-statement triggers.

DROP TRIGGER IF EXISTS auto_populate_error_log ON public.submission_answers;
DROP TRIGGER IF EXISTS auto_populate_error_log_insert ON public.submission_answers;
DROP TRIGGER IF EXISTS auto_populate_error_log_update ON public.submission_answers;

CREATE TRIGGER auto_populate_error_log_insert
  AFTER INSERT ON public.submission_answers
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.auto_populate_error_log();

CREATE TRIGGER auto_populate_error_log_update
  AFTER UPDATE ON public.submission_answers
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.auto_populate_error_log();

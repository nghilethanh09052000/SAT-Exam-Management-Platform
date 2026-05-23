-- Migration: 00011_triggers.sql
-- All triggers: handle_new_user, set_updated_at, auto_populate_error_log

-- ─── set_updated_at ────────────────────────────────────────────────────────
-- Reusable function that sets updated_at = now() on any UPDATE

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply set_updated_at trigger to all tables with updated_at column
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_courses
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_classes
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_weeks
  BEFORE UPDATE ON public.weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_questions
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_assignments
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_assignment_instances
  BEFORE UPDATE ON public.assignment_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_submissions
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_submission_answers
  BEFORE UPDATE ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_error_log
  BEFORE UPDATE ON public.error_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── handle_new_user ───────────────────────────────────────────────────────
-- Auto-creates a profiles record when a new user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profiles are application authorization records and must be created only by
  -- explicit admin/import flows. Auth signups alone must not appear as students.
  RETURN NEW;
END;
$$;

CREATE TRIGGER handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── auto_populate_error_log ───────────────────────────────────────────────
-- Auto-inserts into error_log when a submission_answer is inserted/updated
-- with is_correct = false. Records are never deleted.

CREATE OR REPLACE FUNCTION public.auto_populate_error_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  -- Only fire when is_correct is being set to false
  IF NEW.is_correct IS DISTINCT FROM true AND NEW.is_correct IS NOT NULL THEN
    -- Get the student_id from the submission
    SELECT student_id INTO v_student_id
    FROM public.submissions
    WHERE id = NEW.submission_id;

    -- Only insert if not already logged (idempotent)
    INSERT INTO public.error_log (student_id, submission_id, question_id)
    VALUES (v_student_id, NEW.submission_id, NEW.question_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_populate_error_log
  AFTER INSERT OR UPDATE OF is_correct ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.auto_populate_error_log();

-- ─── archive_expired_courses (scheduled function, no trigger) ──────────────
-- This is called by a Supabase scheduled Edge Function daily at midnight.
-- Provided here as a helper SQL function.

CREATE OR REPLACE FUNCTION public.archive_expired_courses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courses
  SET archived_at = now()
  WHERE expires_at IS NOT NULL
    AND expires_at < now()
    AND archived_at IS NULL;
END;
$$;

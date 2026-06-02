-- Migration: 20260602000000_practice_self_exercise_results.sql
-- Persisted results for the two SELF-EXERCISE flows (per
-- docs/SELF_EXERCISE_SUBMISSION_PLAN.md):
--   • practice_category_results — topic/category drills, keyed by tag_id
--   • self_test_results         — self-serve tests, keyed by exam_paper_id
--
-- One record per practice unit (UNIQUE upsert on retake) — NO attempt history.
-- This is intentionally different from the coursework tables (`submissions`,
-- `practice_test_attempts`) which keep per-attempt history.
--
-- Writes go through the service-role API (/api/student/practice/submit), which
-- authenticates the student in the API layer and passes student_id explicitly,
-- so auth.uid() is NULL at the DB. Students only need a SELECT policy (for the
-- review page); no student INSERT/UPDATE policy is required.

-- ─── PRACTICE_CATEGORY_RESULTS (topic drills) ──────────────────────────────
CREATE TABLE public.practice_category_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_id             UUID NOT NULL REFERENCES public.tags(id)     ON DELETE CASCADE,

  -- Drill difficulty changes the question set, so "Medium" is a different record
  -- than "Easy" on the same tag. 'easy' | 'medium' | 'hard' | 'all'.
  difficulty         TEXT NOT NULL DEFAULT 'all',

  -- Snapshot of the result (one record, overwritten on retake).
  raw_score          INTEGER NOT NULL,
  total_questions    INTEGER NOT NULL,
  answers            JSONB   NOT NULL,  -- [{questionId, selectedOptionId, answerText, isCorrect}]
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,

  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- THE one-record-per-drill guarantee. Retake hits this and upserts.
  UNIQUE (student_id, tag_id, difficulty)
);

CREATE INDEX idx_practice_category_results_student ON public.practice_category_results(student_id);
CREATE INDEX idx_practice_category_results_tag     ON public.practice_category_results(tag_id);

CREATE TRIGGER set_updated_at_practice_category_results
  BEFORE UPDATE ON public.practice_category_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.practice_category_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "practice_category_results_select_own"
  ON public.practice_category_results
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "practice_category_results_all_admin"
  ON public.practice_category_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- ─── SELF_TEST_RESULTS (self-serve tests) ──────────────────────────────────
-- Named self_test_results (not practice_test_results) on purpose, to stay clear
-- of the coursework practice_test_attempts/practice_test_answers tables.
CREATE TABLE public.self_test_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  exam_paper_id      UUID NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,

  raw_score          INTEGER NOT NULL,
  total_questions    INTEGER NOT NULL,
  answers            JSONB   NOT NULL,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,

  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- THE one-record-per-test guarantee.
  UNIQUE (student_id, exam_paper_id)
);

CREATE INDEX idx_self_test_results_student ON public.self_test_results(student_id);
CREATE INDEX idx_self_test_results_paper   ON public.self_test_results(exam_paper_id);

CREATE TRIGGER set_updated_at_self_test_results
  BEFORE UPDATE ON public.self_test_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.self_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_test_results_select_own"
  ON public.self_test_results
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "self_test_results_all_admin"
  ON public.self_test_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

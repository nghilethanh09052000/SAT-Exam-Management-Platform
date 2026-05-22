-- Migration: 00030_public_exam_papers.sql
-- Public mock tests for free Google students.

ALTER TABLE public.exam_papers
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_exam_papers_is_public
  ON public.exam_papers(is_public)
  WHERE is_public = true AND archived_at IS NULL;

DROP POLICY IF EXISTS "exam_papers_select" ON public.exam_papers;
CREATE POLICY "exam_papers_select"
  ON public.exam_papers FOR SELECT
  USING (
    archived_at IS NULL
    AND (
      is_public = true
      OR auth.uid() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "epq_select" ON public.exam_paper_questions;
CREATE POLICY "epq_select"
  ON public.exam_paper_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.exam_papers ep
      WHERE ep.id = exam_paper_questions.exam_paper_id
        AND ep.archived_at IS NULL
        AND (ep.is_public = true OR auth.uid() IS NOT NULL)
    )
  );

CREATE TABLE IF NOT EXISTS public.public_exam_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_paper_id       UUID NOT NULL REFERENCES public.exam_papers(id) ON DELETE RESTRICT,
  student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  status              public.submission_status NOT NULL DEFAULT 'in_progress',
  raw_score           INTEGER,
  total_questions     INTEGER,
  current_question_id UUID,
  current_module      TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  time_spent_seconds  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_paper_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_public_exam_attempts_exam_paper_id ON public.public_exam_attempts(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_public_exam_attempts_student_id ON public.public_exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_public_exam_attempts_status ON public.public_exam_attempts(status);

CREATE TABLE IF NOT EXISTS public.public_exam_answers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id            UUID NOT NULL REFERENCES public.public_exam_attempts(id) ON DELETE CASCADE,
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
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_public_exam_answers_attempt_id ON public.public_exam_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_public_exam_answers_question_id ON public.public_exam_answers(question_id);

CREATE TRIGGER set_updated_at_public_exam_attempts
  BEFORE UPDATE ON public.public_exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_public_exam_answers
  BEFORE UPDATE ON public.public_exam_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.public_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_exam_attempts_own_student"
  ON public.public_exam_attempts FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "public_exam_attempts_teacher_read"
  ON public.public_exam_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "public_exam_answers_own_student"
  ON public.public_exam_answers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.public_exam_attempts a
      WHERE a.id = public_exam_answers.attempt_id
        AND a.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.public_exam_attempts a
      WHERE a.id = public_exam_answers.attempt_id
        AND a.student_id = auth.uid()
        AND a.status = 'in_progress'
    )
  );

CREATE POLICY "public_exam_answers_teacher_read"
  ON public.public_exam_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

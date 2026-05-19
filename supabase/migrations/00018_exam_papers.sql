-- Migration: 00018_exam_papers.sql
-- Ngân Hàng Đề Thi: full exam papers composed of questions from the question bank.
-- An exam paper is a reusable full-test template (e.g. SAT Practice Test 1).
-- It can be assigned to classes the same way assignments are.

-- ─── exam_papers ─────────────────────────────────────────────────────────────

CREATE TABLE public.exam_papers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title        TEXT NOT NULL,                          -- e.g. "SAT Practice Test 1"
  source       TEXT,                                   -- e.g. "College Board", "Khan Academy"
  year         SMALLINT,                               -- e.g. 2024
  description  TEXT,
  archived_at  TIMESTAMPTZ DEFAULT NULL,               -- NULL = active
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exam_papers_created_by  ON public.exam_papers(created_by);
CREATE INDEX idx_exam_papers_archived_at ON public.exam_papers(archived_at);

-- ─── exam_paper_questions ─────────────────────────────────────────────────────
-- Links questions to an exam paper with ordering and module grouping.

CREATE TABLE public.exam_paper_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_paper_id   UUID NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  module_name     TEXT,         -- e.g. "Reading & Writing Module 1", "Math Module 2"
  order_index     INTEGER NOT NULL DEFAULT 0,
  score_weight    NUMERIC NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_paper_id, question_id)
);

CREATE INDEX idx_epq_exam_paper_id ON public.exam_paper_questions(exam_paper_id);
CREATE INDEX idx_epq_question_id   ON public.exam_paper_questions(question_id);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER set_exam_papers_updated_at
  BEFORE UPDATE ON public.exam_papers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.exam_papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_paper_questions ENABLE ROW LEVEL SECURITY;

-- exam_papers: teacher reads all (shared bank), manages own; admin full access
CREATE POLICY "exam_papers_select"
  ON public.exam_papers FOR SELECT
  USING (auth.uid() IS NOT NULL AND archived_at IS NULL);

CREATE POLICY "exam_papers_insert_teacher_admin"
  ON public.exam_papers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "exam_papers_update_own_or_admin"
  ON public.exam_papers FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "exam_papers_delete_own_or_admin"
  ON public.exam_papers FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- exam_paper_questions: same access as parent exam_paper
CREATE POLICY "epq_select"
  ON public.exam_paper_questions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "epq_insert_owner_or_admin"
  ON public.exam_paper_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_papers ep
      WHERE ep.id = exam_paper_id
        AND (ep.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin'
             ))
    )
  );

CREATE POLICY "epq_delete_owner_or_admin"
  ON public.exam_paper_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_papers ep
      WHERE ep.id = exam_paper_id
        AND (ep.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin'
             ))
    )
  );

-- Migration: 00007_questions.sql
-- questions, question_options, question_accepted_answers, question_tags

-- ─── QUESTIONS ─────────────────────────────────────────────────────────────

CREATE TABLE public.questions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  type                 public.question_type NOT NULL,
  content              TEXT NOT NULL,
  image_url            TEXT,
  difficulty           public.question_difficulty,
  content_hash         TEXT UNIQUE NOT NULL,  -- SHA256(normalize(content + correct_answer))
  ai_explanation       TEXT,
  teacher_explanation  TEXT,
  video_url            TEXT,
  archived_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_created_by ON public.questions(created_by);
CREATE INDEX idx_questions_type ON public.questions(type);
CREATE INDEX idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX idx_questions_content_hash ON public.questions(content_hash);
CREATE INDEX idx_questions_archived_at ON public.questions(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD their own questions
CREATE POLICY "questions_all_teacher_own"
  ON public.questions
  FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- All teachers can read all questions (shared bank)
CREATE POLICY "questions_select_all_teachers"
  ON public.questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "questions_all_admin"
  ON public.questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Students can read questions only through active assignment (enforced in app layer)
-- No direct read policy for students — enforced via assignment_questions join in API routes

-- ─── QUESTION_OPTIONS ──────────────────────────────────────────────────────

CREATE TABLE public.question_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,    -- 'A', 'B', 'C', 'D'
  content      TEXT NOT NULL,
  is_correct   BOOLEAN NOT NULL DEFAULT false,
  "order"      INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_question_options_question_id ON public.question_options(question_id);

ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

-- Same access as questions
CREATE POLICY "question_options_all_teacher_own"
  ON public.question_options
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_options.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_options.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_options_select_all_teachers"
  ON public.question_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_options_all_admin"
  ON public.question_options
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── QUESTION_ACCEPTED_ANSWERS ─────────────────────────────────────────────

CREATE TABLE public.question_accepted_answers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_question_accepted_answers_question_id ON public.question_accepted_answers(question_id);

ALTER TABLE public.question_accepted_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_accepted_answers_all_teacher_own"
  ON public.question_accepted_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_accepted_answers_select_all_teachers"
  ON public.question_accepted_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_accepted_answers_all_admin"
  ON public.question_accepted_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ─── QUESTION_TAGS ─────────────────────────────────────────────────────────

CREATE TABLE public.question_tags (
  question_id  UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES public.tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (question_id, tag_id)
);

CREATE INDEX idx_question_tags_tag_id ON public.question_tags(tag_id);

ALTER TABLE public.question_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_tags_all_teacher_own"
  ON public.question_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_tags.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = question_tags.question_id
        AND q.created_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_tags_select_all_teachers"
  ON public.question_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "question_tags_all_admin"
  ON public.question_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Migration: add subject directly to questions table
--
-- Instead of deriving subject via question_tags → tags.subject (fragile join,
-- breaks for untagged questions), store it as a first-class column.
--
-- • NULL means "not yet classified" (safe default for existing rows)
-- • Backfill pulls the subject from the first tag attached to each question
-- • Index added for the common filter: WHERE subject = 'math'

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS subject public.subject_type;

-- Backfill existing questions from their tags
UPDATE public.questions q
SET subject = t.subject
FROM public.question_tags qt
JOIN public.tags t ON t.id = qt.tag_id
WHERE qt.question_id = q.id
  AND q.subject IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subject
  ON public.questions (subject)
  WHERE subject IS NOT NULL;

-- Update search_questions RPC to filter by questions.subject directly
-- (no more EXISTS sub-select through question_tags)
--
-- PostgreSQL does not allow CREATE OR REPLACE to change a function's return
-- type, so we drop and recreate it.  The previous version (from migration
-- 20260527000000) returned (id, type, content_preview, difficulty,
-- created_at, tags) — we are adding the `subject` column here.
DROP FUNCTION IF EXISTS public.search_questions(TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, INT);

CREATE OR REPLACE FUNCTION public.search_questions(
  p_search           TEXT        DEFAULT NULL,
  p_type             TEXT        DEFAULT NULL,
  p_difficulty       TEXT        DEFAULT NULL,
  p_tag_id           UUID        DEFAULT NULL,
  p_subject          TEXT        DEFAULT NULL,
  p_after_created_at TIMESTAMPTZ DEFAULT NULL,
  p_after_id         UUID        DEFAULT NULL,
  p_limit            INT         DEFAULT 21
)
RETURNS TABLE (
  id              UUID,
  type            TEXT,
  content_preview TEXT,
  difficulty      TEXT,
  subject         TEXT,
  created_at      TIMESTAMPTZ,
  tags            JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    q.id,
    q.type::text,
    q.content_preview,
    q.difficulty::text,
    q.subject::text,
    q.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', t.id, 'name', t.name, 'subject', t.subject)
          ORDER BY t.subject, t.name
        )
        FROM question_tags qt2
        JOIN tags t ON t.id = qt2.tag_id
        WHERE qt2.question_id = q.id
      ),
      '[]'::jsonb
    ) AS tags
  FROM questions q
  WHERE q.archived_at IS NULL

    AND (p_type    IS NULL OR q.type::text       = p_type)
    AND (p_difficulty IS NULL OR q.difficulty::text = p_difficulty)

    -- subject filter — direct column, no join needed
    AND (p_subject IS NULL OR q.subject::text    = p_subject)

    -- tag_id filter (kept for topic drill-down)
    AND (p_tag_id  IS NULL OR EXISTS (
      SELECT 1 FROM question_tags qt
      WHERE qt.question_id = q.id AND qt.tag_id = p_tag_id
    ))

    AND (
      p_search IS NULL
      OR COALESCE(q.content_preview, '') ILIKE '%' || p_search || '%'
      OR EXISTS (
        SELECT 1
        FROM question_tags qt
        JOIN tags t ON t.id = qt.tag_id
        WHERE qt.question_id = q.id
          AND t.name ILIKE '%' || p_search || '%'
      )
    )

    AND (
      p_search IS NOT NULL
      OR p_after_created_at IS NULL
      OR q.created_at < p_after_created_at
      OR (q.created_at = p_after_created_at AND q.id < p_after_id)
    )

  ORDER BY
    CASE
      WHEN p_search IS NULL THEN 0
      WHEN COALESCE(q.content_preview, '') ILIKE p_search || '%'        THEN 0
      WHEN COALESCE(q.content_preview, '') ILIKE '%' || p_search || '%' THEN 1
      ELSE 2
    END,
    q.created_at DESC,
    q.id DESC
  LIMIT p_limit;
$$;

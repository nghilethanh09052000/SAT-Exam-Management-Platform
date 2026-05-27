-- Migration: add p_subject filter to search_questions
--
-- Adds an optional subject filter so the question bank UI can filter
-- "Math" vs "Reading & Writing" questions using the search_questions RPC.
-- Subject is looked up via question_tags → tags.subject (existing schema).

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

    -- type filter
    AND (p_type IS NULL OR q.type::text = p_type)

    -- difficulty filter
    AND (p_difficulty IS NULL OR q.difficulty::text = p_difficulty)

    -- tag_id filter
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM question_tags qt
      WHERE qt.question_id = q.id AND qt.tag_id = p_tag_id
    ))

    -- subject filter (math | reading_writing) — via question_tags → tags.subject
    AND (p_subject IS NULL OR EXISTS (
      SELECT 1
      FROM question_tags qt
      JOIN tags t ON t.id = qt.tag_id
      WHERE qt.question_id = q.id
        AND t.subject::text = p_subject
    ))

    -- search filter: content_preview OR any tag name
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

    -- keyset cursor: only applied when NOT doing a keyword search.
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

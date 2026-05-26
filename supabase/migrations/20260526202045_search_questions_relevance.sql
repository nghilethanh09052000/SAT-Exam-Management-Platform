-- Migration: fix search_questions ordering — relevance-first
--
-- Problem: results were ordered only by created_at DESC. With 500 questions,
-- many contain "In the" somewhere (image questions: "In the xy-plane...",
-- "In the figure..."). A question that STARTS with "In the equation..." got
-- buried past position 20 because recently-imported image questions were newer.
--
-- Fix:
--   1. Order by relevance tier FIRST, then by created_at DESC within each tier:
--        Tier 0 — content_preview STARTS WITH the search term  (best match)
--        Tier 1 — content_preview CONTAINS the search term     (partial match)
--        Tier 2 — only a tag name matches                      (weakest match)
--   2. When p_search is supplied, ignore the keyset cursor so callers can always
--      get the most relevant page-1 results without worrying about cursor state.
--      (Search results are returned up to p_limit; callers should pass a large
--      limit and omit the cursor params when doing a keyword search.)

CREATE OR REPLACE FUNCTION public.search_questions(
  p_search           TEXT        DEFAULT NULL,
  p_type             TEXT        DEFAULT NULL,
  p_difficulty       TEXT        DEFAULT NULL,
  p_tag_id           UUID        DEFAULT NULL,
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
    -- When p_search is set the caller always wants the most relevant results
    -- from the top, so cursor-based pagination is skipped.
    AND (
      p_search IS NOT NULL           -- searching: ignore cursor
      OR p_after_created_at IS NULL  -- browsing page 1: no cursor yet
      OR q.created_at < p_after_created_at
      OR (q.created_at = p_after_created_at AND q.id < p_after_id)
    )

  ORDER BY
    -- Relevance tier (only meaningful when p_search is set)
    CASE
      WHEN p_search IS NULL THEN 0
      WHEN COALESCE(q.content_preview, '') ILIKE p_search || '%'        THEN 0  -- starts with → best
      WHEN COALESCE(q.content_preview, '') ILIKE '%' || p_search || '%' THEN 1  -- contains
      ELSE 2                                                                      -- tag-only match
    END,
    q.created_at DESC,
    q.id DESC
  LIMIT p_limit;
$$;

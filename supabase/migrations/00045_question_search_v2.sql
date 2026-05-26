-- ── Compound question search RPC ──────────────────────────────────────────────
--
-- Problem: 97 % of questions are image-based. Their content_preview starts with
-- "See the original SAT Math question image below." and the actual question text
-- is stored as a PNG in Supabase Storage — invisible to a plain ILIKE search.
-- All image-based questions do, however, have descriptive tags (e.g. "Algebra",
-- "Linear equations in two variables"). Searching "algebra" should find them.
--
-- Solution: a single SQL function that:
--   1. matches content_preview ILIKE '%term%'   (existing behaviour, fast via trigram GIN)
--   2. OR matches any associated tag name ILIKE '%term%'  (new)
--
-- The API (/api/questions) calls this RPC when the `search` param is present.
-- All other filtering (type, difficulty, tag_id, keyset cursor) is handled
-- inside the function so it remains a single DB round-trip.

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

    -- tag_id filter (exact tag match, replicates !inner join behaviour)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM question_tags qt
      WHERE qt.question_id = q.id AND qt.tag_id = p_tag_id
    ))

    -- compound search: content_preview OR any tag name
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

    -- keyset cursor: (created_at DESC, id DESC)
    AND (
      p_after_created_at IS NULL
      OR q.created_at < p_after_created_at
      OR (q.created_at = p_after_created_at AND q.id < p_after_id)
    )

  ORDER BY q.created_at DESC, q.id DESC
  LIMIT p_limit;
$$;

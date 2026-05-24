-- ─── Fix FTS index: content → content_preview ────────────────────────────────
--
-- Migration 00039 created a GIN FTS index on the full `content` column.
-- That column stores raw HTML and may contain base64-encoded images (several
-- MB per row). Computing to_tsvector on those rows at query time (before the
-- index is built, or on databases where the migration timed out) causes
-- Supabase to hit the statement_timeout and return HTTP 400.
--
-- Fix: drop the broken index, create a correct one on content_preview instead.
-- content_preview is a stored generated column (200 plain-text chars, no HTML,
-- no base64), so the GIN index is tiny and index creation is fast.
--
-- The API route (/api/questions) was also updated to ILIKE on content_preview
-- rather than textSearch on content. At current scale (< 50 000 questions)
-- ILIKE on a 200-char column is fast enough without any index. This trigram
-- index is here for future scale only.

-- 1. Remove the broken index (safe — IF EXISTS handles DBs that never built it)
DROP INDEX IF EXISTS public.idx_questions_fts;

-- 2. Enable pg_trgm for ILIKE acceleration (idempotent, no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Trigram GIN index on content_preview — accelerates ILIKE '%term%' queries
--    at any scale without the base64/HTML tokenisation problem.
CREATE INDEX IF NOT EXISTS idx_questions_content_preview_trgm
  ON public.questions
  USING gin (content_preview gin_trgm_ops)
  WHERE archived_at IS NULL;

-- Migration: add stimulus and prompt columns to questions
--
-- stimulus: the reading passage / problem context shown in the LEFT panel
--           (only present for Reading & Writing questions with a passage,
--            and for multi-part Math problems with a scenario block)
-- prompt:   the actual question stem shown in the RIGHT panel
--           (e.g. "Which choice completes the text…")
--
-- Both are nullable:
--   • When stimulus IS NULL → render as single-column (Math / short standalone questions)
--   • When stimulus IS NOT NULL → render as two-column split (passage | question+options)
--
-- Existing rows keep NULL in both columns; the test interface falls back to the
-- legacy heuristic splitter for backward compatibility.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS stimulus TEXT,
  ADD COLUMN IF NOT EXISTS prompt   TEXT;

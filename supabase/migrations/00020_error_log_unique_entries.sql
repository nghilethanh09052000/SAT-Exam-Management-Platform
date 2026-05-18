-- Migration: 00020_error_log_unique_entries.sql
-- Keep exactly one error-log row per wrong question within a single attempt.
-- Historical mistakes across separate attempts are still preserved because
-- each attempt has its own submission_id.

DELETE FROM public.error_log a
USING public.error_log b
WHERE a.id > b.id
  AND a.submission_id = b.submission_id
  AND a.question_id = b.question_id;

ALTER TABLE public.error_log
  ADD CONSTRAINT error_log_submission_question_unique
  UNIQUE (submission_id, question_id);

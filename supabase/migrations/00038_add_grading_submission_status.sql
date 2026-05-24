-- Add 'grading' to submission_status enum.
--
-- The submit route (Case 1 performance fix) atomically flips status from
-- 'in_progress' → 'grading' as a double-submit guard, then enqueues a
-- background grading job which flips it to 'submitted'.
--
-- Postgres requires ALTER TYPE ... ADD VALUE to be run outside a transaction
-- when the type is used in tables with existing rows, so this is standalone.

ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'grading' AFTER 'in_progress';

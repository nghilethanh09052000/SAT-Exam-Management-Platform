-- Migration: 00019_bluebook_progress.sql
-- Persist the student's current position so in-progress tests resume where they left off.

ALTER TABLE public.submissions
  ADD COLUMN current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  ADD COLUMN current_module TEXT;

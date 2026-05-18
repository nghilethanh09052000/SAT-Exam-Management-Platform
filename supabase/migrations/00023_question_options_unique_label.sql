-- Migration: 00023_question_options_unique_label.sql
-- A question may only have one option for a given label (A/B/C/D).

DELETE FROM public.question_options a
USING public.question_options b
WHERE a.id > b.id
  AND a.question_id = b.question_id
  AND a.label = b.label;

ALTER TABLE public.question_options
  ADD CONSTRAINT question_options_question_label_unique
  UNIQUE (question_id, label);

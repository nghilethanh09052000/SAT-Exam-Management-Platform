-- Migration: 00024_question_accepted_answers_unique.sql
-- Re-running seeds/imports must not duplicate equivalent accepted answers.

DELETE FROM public.question_accepted_answers a
USING public.question_accepted_answers b
WHERE a.id > b.id
  AND a.question_id = b.question_id
  AND a.answer_text = b.answer_text;

ALTER TABLE public.question_accepted_answers
  ADD CONSTRAINT question_accepted_answers_question_text_unique
  UNIQUE (question_id, answer_text);

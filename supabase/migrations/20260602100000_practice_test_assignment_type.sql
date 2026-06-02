-- Migration: 20260602100000_practice_test_assignment_type.sql
-- Distinguish coursework mock tests from self-practice tests.
--
-- Previously every published practice_test_assignment showed in BOTH the
-- Coursework → Mock tab and the Self-practice → Test tab, because both read the
-- same table with the same filter. This adds a `test_type` so each assignment
-- belongs to exactly one audience, chosen by the teacher at assign time.

CREATE TYPE public.practice_test_type AS ENUM ('coursework', 'self_practice');

-- Existing rows default to 'coursework' (the established teacher mock-test flow);
-- they stay in the Coursework Mock tab and drop out of the Self-practice tab.
ALTER TABLE public.practice_test_assignments
  ADD COLUMN test_type public.practice_test_type NOT NULL DEFAULT 'coursework';

CREATE INDEX idx_practice_test_assignments_test_type
  ON public.practice_test_assignments(test_type);

-- The same exam paper can now be assigned to the same class/week as BOTH a
-- coursework test and a self-practice test, so test_type joins the unique key.
DROP INDEX IF EXISTS public.idx_practice_test_assignments_unique_class_week_test;
CREATE UNIQUE INDEX idx_practice_test_assignments_unique_class_week_test
  ON public.practice_test_assignments(practice_test_id, class_id, week_id, test_type);

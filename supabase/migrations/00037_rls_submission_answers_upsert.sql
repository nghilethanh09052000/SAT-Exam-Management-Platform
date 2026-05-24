-- ─── RLS: student can upsert own in-progress submission answers ───────────────
--
-- Replaces the explicit SELECT ownership check in /api/submission-answers/route.ts
-- with a Postgres-level policy so the auto-save endpoint becomes a single
-- round-trip (one upsert) instead of two sequential queries.
--
-- Policy logic:
--   Allow INSERT / UPDATE on submission_answers only when a matching submission
--   exists that belongs to the current user AND is still in_progress.
--   If the submission is 'grading' or 'submitted', the upsert is rejected with
--   a 42501 permission-denied error which the route maps to 403.

CREATE POLICY "student can upsert own in-progress answers"
ON public.submission_answers
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id         = submission_answers.submission_id
      AND s.student_id = auth.uid()
      AND s.status     = 'in_progress'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id         = submission_answers.submission_id
      AND s.student_id = auth.uid()
      AND s.status     = 'in_progress'
  )
);

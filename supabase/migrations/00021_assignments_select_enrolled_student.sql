-- Migration: 00021_assignments_select_enrolled_student.sql
-- Students may read assignment metadata only when the assignment is published
-- to a class they are enrolled in.

CREATE POLICY "assignments_select_enrolled_student"
  ON public.assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_instances ai
      JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE ai.assignment_id = assignments.id
        AND ai.published_at IS NOT NULL
        AND e.student_id = auth.uid()
    )
  );

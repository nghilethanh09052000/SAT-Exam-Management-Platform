-- Migration: 00012_rls_cross_table.sql
-- Deferred RLS policies that reference multiple tables.
-- Must run AFTER all tables are created (after 00011_triggers.sql).

-- ─── profiles ────────────────────────────────────────────────────────────────

-- Teacher can read profiles of students in their classes
CREATE POLICY "profiles_select_teacher"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    )
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
        JOIN public.classes cl ON cl.id = e.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE e.student_id = profiles.id
        AND co.teacher_id = auth.uid()
    )
  );

-- ─── courses ─────────────────────────────────────────────────────────────────

-- Student can read courses they are enrolled in
CREATE POLICY "courses_select_enrolled_student"
  ON public.courses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
        JOIN public.classes cl ON cl.id = e.class_id
      WHERE e.student_id = auth.uid()
        AND cl.course_id = courses.id
    )
  );

-- ─── classes ─────────────────────────────────────────────────────────────────

-- Student can read their enrolled class only
CREATE POLICY "classes_select_enrolled_student"
  ON public.classes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.class_id = classes.id
    )
  );

-- ─── weeks ───────────────────────────────────────────────────────────────────

-- Student can read weeks in their enrolled class
CREATE POLICY "weeks_select_student"
  ON public.weeks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.class_id = weeks.class_id
    )
  );

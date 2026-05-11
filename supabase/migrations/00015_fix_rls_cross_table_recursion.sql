-- Migration: 00015_fix_rls_cross_table_recursion.sql
-- Fix infinite recursion in RLS policies caused by cross-table references.
--
-- Problem: courses_select_enrolled_student joined enrollments directly.
-- When a teacher (or any user) queries courses, ALL applicable policies are
-- evaluated including courses_select_enrolled_student. That policy queries
-- enrollments, which triggers enrollments_all_teacher_own, which joins
-- classes→courses, which again evaluates courses_select_enrolled_student.
-- Result: "infinite recursion detected in policy for relation enrollments/courses"
--
-- Fix: wrap the enrollment check in SECURITY DEFINER functions, which bypass
-- RLS entirely, breaking the recursive chain.

-- ─── courses_select_enrolled_student fix ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_course(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
    WHERE e.student_id = auth.uid()
      AND cl.course_id = p_course_id
  )
$$;

DROP POLICY IF EXISTS "courses_select_enrolled_student" ON public.courses;
CREATE POLICY "courses_select_enrolled_student"
  ON public.courses
  FOR SELECT
  USING (
    public.auth_student_enrolled_in_course(courses.id)
  );

-- ─── classes_select_enrolled_student fix ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = auth.uid()
      AND e.class_id = p_class_id
  )
$$;

DROP POLICY IF EXISTS "classes_select_enrolled_student" ON public.classes;
CREATE POLICY "classes_select_enrolled_student"
  ON public.classes
  FOR SELECT
  USING (
    public.auth_student_enrolled_in_class(classes.id)
  );

-- Migration: 00013_fix_rls_recursion.sql
-- Fix infinite-recursion RLS policies on the profiles table.
--
-- Root cause: policies like "profiles_select_admin" queried public.profiles
-- from WITHIN a policy ON public.profiles → PostgreSQL infinite recursion
-- (error 42P17).
--
-- Fix: introduce a SECURITY DEFINER helper function that reads the caller's
-- role without going through RLS, then rewrite every recursive policy to
-- call this function instead.

-- ─── Helper function ─────────────────────────────────────────────────────────

-- Runs as the function owner (postgres) who has BYPASSRLS, so no policies
-- are evaluated on the inner SELECT → no recursion possible.
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ─── profiles: drop & recreate recursive policies ───────────────────────────

-- Admin SELECT (was recursive)
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (public.auth_user_role() = 'admin');

-- Admin UPDATE (was recursive)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.auth_user_role() = 'admin');

-- Teacher SELECT (was recursive — defined in 00012_rls_cross_table.sql)
DROP POLICY IF EXISTS "profiles_select_teacher" ON public.profiles;
CREATE POLICY "profiles_select_teacher"
  ON public.profiles
  FOR SELECT
  USING (
    public.auth_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
        JOIN public.classes cl ON cl.id = e.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE e.student_id = profiles.id
        AND co.teacher_id = auth.uid()
    )
  );

-- ─── courses: fix policies that checked role by querying profiles ─────────────

DROP POLICY IF EXISTS "courses_all_teacher_own" ON public.courses;
CREATE POLICY "courses_all_teacher_own"
  ON public.courses
  FOR ALL
  USING (
    teacher_id = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "courses_all_admin" ON public.courses;
CREATE POLICY "courses_all_admin"
  ON public.courses
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── classes: fix policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "classes_all_teacher_own" ON public.classes;
CREATE POLICY "classes_all_teacher_own"
  ON public.classes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.courses co
      WHERE co.id = classes.course_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses co
      WHERE co.id = classes.course_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "classes_all_admin" ON public.classes;
CREATE POLICY "classes_all_admin"
  ON public.classes
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── weeks: fix policies ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "weeks_all_teacher_own" ON public.weeks;
CREATE POLICY "weeks_all_teacher_own"
  ON public.weeks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "weeks_all_admin" ON public.weeks;
CREATE POLICY "weeks_all_admin"
  ON public.weeks
  FOR ALL
  USING (public.auth_user_role() = 'admin');

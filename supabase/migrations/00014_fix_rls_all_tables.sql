-- Migration: 00014_fix_rls_all_tables.sql
-- Replace every "SELECT 1 FROM public.profiles WHERE role = ..." inside RLS
-- policies with calls to the auth_user_role() security-definer function
-- (created in 00013). This eliminates all cross-table recursion chains that
-- caused "infinite recursion detected in policy for relation X" errors.
--
-- Pattern replaced everywhere:
--   EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
--   → public.auth_user_role() = 'admin'
--
--   JOIN public.profiles p ON p.id = auth.uid() ... AND p.role IN ('teacher','admin')
--   → (remove the JOIN) ... AND public.auth_user_role() IN ('teacher','admin')

-- ─── profiles_select_teacher: fix enrollment subquery too ────────────────────
-- The version in 00013 still queried enrollments directly, which triggered
-- enrollments RLS → profiles RLS → recursion. Wrap in a security-definer fn.

CREATE OR REPLACE FUNCTION public.auth_teacher_has_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
      JOIN public.courses co ON co.id = cl.course_id
    WHERE e.student_id = p_student_id
      AND co.teacher_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "profiles_select_teacher" ON public.profiles;
CREATE POLICY "profiles_select_teacher"
  ON public.profiles
  FOR SELECT
  USING (
    public.auth_user_role() = 'teacher'
    AND public.auth_teacher_has_student(profiles.id)
  );

-- ─── device_sessions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "device_sessions_select_admin" ON public.device_sessions;
CREATE POLICY "device_sessions_select_admin"
  ON public.device_sessions
  FOR SELECT
  USING (public.auth_user_role() = 'admin');

DROP POLICY IF EXISTS "device_sessions_select_teacher" ON public.device_sessions;
CREATE POLICY "device_sessions_select_teacher"
  ON public.device_sessions
  FOR SELECT
  USING (public.auth_user_role() = 'teacher');

-- ─── enrollments ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "enrollments_all_teacher_own" ON public.enrollments;
CREATE POLICY "enrollments_all_teacher_own"
  ON public.enrollments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "enrollments_all_admin" ON public.enrollments;
CREATE POLICY "enrollments_all_admin"
  ON public.enrollments
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── tags ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tags_all_admin" ON public.tags;
CREATE POLICY "tags_all_admin"
  ON public.tags
  FOR ALL
  USING (public.auth_user_role() = 'admin')
  WITH CHECK (public.auth_user_role() = 'admin');

-- ─── questions ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "questions_all_teacher_own" ON public.questions;
CREATE POLICY "questions_all_teacher_own"
  ON public.questions
  FOR ALL
  USING (
    created_by = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "questions_select_all_teachers" ON public.questions;
CREATE POLICY "questions_select_all_teachers"
  ON public.questions
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "questions_all_admin" ON public.questions;
CREATE POLICY "questions_all_admin"
  ON public.questions
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── question_options ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "question_options_all_teacher_own" ON public.question_options;
CREATE POLICY "question_options_all_teacher_own"
  ON public.question_options
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_options.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_options.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "question_options_select_all_teachers" ON public.question_options;
CREATE POLICY "question_options_select_all_teachers"
  ON public.question_options
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "question_options_all_admin" ON public.question_options;
CREATE POLICY "question_options_all_admin"
  ON public.question_options
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── question_accepted_answers ───────────────────────────────────────────────

DROP POLICY IF EXISTS "question_accepted_answers_all_teacher_own" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_all_teacher_own"
  ON public.question_accepted_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "question_accepted_answers_select_all_teachers" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_select_all_teachers"
  ON public.question_accepted_answers
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "question_accepted_answers_all_admin" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_all_admin"
  ON public.question_accepted_answers
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── question_tags ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "question_tags_all_teacher_own" ON public.question_tags;
CREATE POLICY "question_tags_all_teacher_own"
  ON public.question_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_tags.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_tags.question_id
        AND q.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "question_tags_select_all_teachers" ON public.question_tags;
CREATE POLICY "question_tags_select_all_teachers"
  ON public.question_tags
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "question_tags_all_admin" ON public.question_tags;
CREATE POLICY "question_tags_all_admin"
  ON public.question_tags
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── assignments ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assignments_all_teacher_own" ON public.assignments;
CREATE POLICY "assignments_all_teacher_own"
  ON public.assignments
  FOR ALL
  USING (
    created_by = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "assignments_select_all_teachers" ON public.assignments;
CREATE POLICY "assignments_select_all_teachers"
  ON public.assignments
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "assignments_all_admin" ON public.assignments;
CREATE POLICY "assignments_all_admin"
  ON public.assignments
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── assignment_questions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assignment_questions_all_teacher_own" ON public.assignment_questions;
CREATE POLICY "assignment_questions_all_teacher_own"
  ON public.assignment_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_questions.assignment_id
        AND a.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_questions.assignment_id
        AND a.created_by = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "assignment_questions_select_all_teachers" ON public.assignment_questions;
CREATE POLICY "assignment_questions_select_all_teachers"
  ON public.assignment_questions
  FOR SELECT
  USING (public.auth_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "assignment_questions_all_admin" ON public.assignment_questions;
CREATE POLICY "assignment_questions_all_admin"
  ON public.assignment_questions
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── assignment_instances ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assignment_instances_all_teacher_own" ON public.assignment_instances;
CREATE POLICY "assignment_instances_all_teacher_own"
  ON public.assignment_instances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "assignment_instances_all_admin" ON public.assignment_instances;
CREATE POLICY "assignment_instances_all_admin"
  ON public.assignment_instances
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── submissions ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "submissions_select_teacher_own" ON public.submissions;
CREATE POLICY "submissions_select_teacher_own"
  ON public.submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_instances ai
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE ai.id = submissions.instance_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "submissions_all_admin" ON public.submissions;
CREATE POLICY "submissions_all_admin"
  ON public.submissions
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── submission_answers ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "submission_answers_select_teacher_own" ON public.submission_answers;
CREATE POLICY "submission_answers_select_teacher_own"
  ON public.submission_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE s.id = submission_answers.submission_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "submission_answers_all_admin" ON public.submission_answers;
CREATE POLICY "submission_answers_all_admin"
  ON public.submission_answers
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── error_log ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "error_log_select_teacher_own" ON public.error_log;
CREATE POLICY "error_log_select_teacher_own"
  ON public.error_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE s.id = error_log.submission_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "error_log_all_admin" ON public.error_log;
CREATE POLICY "error_log_all_admin"
  ON public.error_log
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── tab_switch_events ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tab_switch_events_select_teacher_own" ON public.tab_switch_events;
CREATE POLICY "tab_switch_events_select_teacher_own"
  ON public.tab_switch_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE s.id = tab_switch_events.submission_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "tab_switch_events_all_admin" ON public.tab_switch_events;
CREATE POLICY "tab_switch_events_all_admin"
  ON public.tab_switch_events
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── class_library_folders ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "class_library_folders_all_teacher_own" ON public.class_library_folders;
CREATE POLICY "class_library_folders_all_teacher_own"
  ON public.class_library_folders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = class_library_folders.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = class_library_folders.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "class_library_folders_all_admin" ON public.class_library_folders;
CREATE POLICY "class_library_folders_all_admin"
  ON public.class_library_folders
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── class_library_files ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "class_library_files_all_teacher_own" ON public.class_library_files;
CREATE POLICY "class_library_files_all_teacher_own"
  ON public.class_library_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.class_library_folders f
        JOIN public.classes cl ON cl.id = f.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE f.id = class_library_files.folder_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_library_folders f
        JOIN public.classes cl ON cl.id = f.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE f.id = class_library_files.folder_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "class_library_files_all_admin" ON public.class_library_files;
CREATE POLICY "class_library_files_all_admin"
  ON public.class_library_files
  FOR ALL
  USING (public.auth_user_role() = 'admin');

-- ─── notifications ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notifications_all_teacher_own" ON public.notifications;
CREATE POLICY "notifications_all_teacher_own"
  ON public.notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = notifications.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = notifications.class_id
        AND co.teacher_id = auth.uid()
    )
    AND public.auth_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "notifications_all_admin" ON public.notifications;
CREATE POLICY "notifications_all_admin"
  ON public.notifications
  FOR ALL
  USING (public.auth_user_role() = 'admin');

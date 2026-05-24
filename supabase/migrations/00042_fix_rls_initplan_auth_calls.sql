-- Migration: 00042_fix_rls_initplan_auth_calls.sql
-- Reduce RLS per-row overhead by wrapping stable auth helper calls in scalar
-- subqueries. This lets Postgres evaluate auth.uid() / auth_user_role() once
-- per statement where possible instead of re-running them for every row.

-- ─── SECURITY DEFINER HELPERS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (select auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.student_id = (select auth.uid())
      AND e.class_id = p_class_id
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_course(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
    WHERE e.student_id = (select auth.uid())
      AND cl.course_id = p_course_id
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_teacher_has_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
      JOIN public.courses co ON co.id = cl.course_id
    WHERE e.student_id = p_student_id
      AND co.teacher_id = (select auth.uid())
  )
$$;

-- ─── PROFILES ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_select_teacher" ON public.profiles;
CREATE POLICY "profiles_select_teacher"
  ON public.profiles
  FOR SELECT
  USING (
    (select public.auth_user_role()) = 'teacher'
    AND public.auth_teacher_has_student(profiles.id)
  );

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ─── DEVICE SESSIONS ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "device_sessions_delete_own" ON public.device_sessions;
CREATE POLICY "device_sessions_delete_own"
  ON public.device_sessions
  FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "device_sessions_insert_own" ON public.device_sessions;
CREATE POLICY "device_sessions_insert_own"
  ON public.device_sessions
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "device_sessions_select_admin" ON public.device_sessions;
CREATE POLICY "device_sessions_select_admin"
  ON public.device_sessions
  FOR SELECT
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "device_sessions_select_own" ON public.device_sessions;
CREATE POLICY "device_sessions_select_own"
  ON public.device_sessions
  FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "device_sessions_select_teacher" ON public.device_sessions;
CREATE POLICY "device_sessions_select_teacher"
  ON public.device_sessions
  FOR SELECT
  USING ((select public.auth_user_role()) = 'teacher');

DROP POLICY IF EXISTS "device_sessions_update_own" ON public.device_sessions;
CREATE POLICY "device_sessions_update_own"
  ON public.device_sessions
  FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ─── COURSES / CLASSES / WEEKS / ENROLLMENTS ────────────────────────────────

DROP POLICY IF EXISTS "courses_all_admin" ON public.courses;
CREATE POLICY "courses_all_admin"
  ON public.courses
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "courses_all_teacher_own" ON public.courses;
CREATE POLICY "courses_all_teacher_own"
  ON public.courses
  FOR ALL
  USING (
    teacher_id = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    teacher_id = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "courses_select_enrolled_student" ON public.courses;
CREATE POLICY "courses_select_enrolled_student"
  ON public.courses
  FOR SELECT
  USING (public.auth_student_enrolled_in_course(courses.id));

DROP POLICY IF EXISTS "classes_all_admin" ON public.classes;
CREATE POLICY "classes_all_admin"
  ON public.classes
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "classes_all_teacher_own" ON public.classes;
CREATE POLICY "classes_all_teacher_own"
  ON public.classes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses co
      WHERE co.id = classes.course_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.courses co
      WHERE co.id = classes.course_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "classes_select_enrolled_student" ON public.classes;
CREATE POLICY "classes_select_enrolled_student"
  ON public.classes
  FOR SELECT
  USING (public.auth_student_enrolled_in_class(classes.id));

DROP POLICY IF EXISTS "weeks_all_admin" ON public.weeks;
CREATE POLICY "weeks_all_admin"
  ON public.weeks
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "weeks_all_teacher_own" ON public.weeks;
CREATE POLICY "weeks_all_teacher_own"
  ON public.weeks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "weeks_select_student" ON public.weeks;
CREATE POLICY "weeks_select_student"
  ON public.weeks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = (select auth.uid())
        AND e.class_id = weeks.class_id
    )
  );

DROP POLICY IF EXISTS "enrollments_all_admin" ON public.enrollments;
CREATE POLICY "enrollments_all_admin"
  ON public.enrollments
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "enrollments_all_teacher_own" ON public.enrollments;
CREATE POLICY "enrollments_all_teacher_own"
  ON public.enrollments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "enrollments_select_own_student" ON public.enrollments;
CREATE POLICY "enrollments_select_own_student"
  ON public.enrollments
  FOR SELECT
  USING (student_id = (select auth.uid()));

-- ─── QUESTION BANK ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tags_all_admin" ON public.tags;
CREATE POLICY "tags_all_admin"
  ON public.tags
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin')
  WITH CHECK ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "tags_select_authenticated" ON public.tags;
CREATE POLICY "tags_select_authenticated"
  ON public.tags
  FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "questions_all_admin" ON public.questions;
CREATE POLICY "questions_all_admin"
  ON public.questions
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "questions_all_teacher_own" ON public.questions;
CREATE POLICY "questions_all_teacher_own"
  ON public.questions
  FOR ALL
  USING (
    created_by = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    created_by = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "questions_select_all_teachers" ON public.questions;
CREATE POLICY "questions_select_all_teachers"
  ON public.questions
  FOR SELECT
  USING ((select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role]));

DROP POLICY IF EXISTS "questions_select_enrolled_student" ON public.questions;
CREATE POLICY "questions_select_enrolled_student"
  ON public.questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_questions aq
        JOIN public.assignment_instances ai ON ai.assignment_id = aq.assignment_id
        JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE aq.question_id = questions.id
        AND ai.published_at IS NOT NULL
        AND e.student_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "question_options_all_admin" ON public.question_options;
CREATE POLICY "question_options_all_admin"
  ON public.question_options
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "question_options_all_teacher_own" ON public.question_options;
CREATE POLICY "question_options_all_teacher_own"
  ON public.question_options
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_options.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_options.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "question_options_select_all_teachers" ON public.question_options;
CREATE POLICY "question_options_select_all_teachers"
  ON public.question_options
  FOR SELECT
  USING ((select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role]));

DROP POLICY IF EXISTS "question_options_select_enrolled_student" ON public.question_options;
CREATE POLICY "question_options_select_enrolled_student"
  ON public.question_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_questions aq
        JOIN public.assignment_instances ai ON ai.assignment_id = aq.assignment_id
        JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE aq.question_id = question_options.question_id
        AND ai.published_at IS NOT NULL
        AND e.student_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "question_accepted_answers_all_admin" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_all_admin"
  ON public.question_accepted_answers
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "question_accepted_answers_all_teacher_own" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_all_teacher_own"
  ON public.question_accepted_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_accepted_answers.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "question_accepted_answers_select_all_teachers" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_select_all_teachers"
  ON public.question_accepted_answers
  FOR SELECT
  USING ((select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role]));

DROP POLICY IF EXISTS "question_accepted_answers_select_enrolled_student" ON public.question_accepted_answers;
CREATE POLICY "question_accepted_answers_select_enrolled_student"
  ON public.question_accepted_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_questions aq
        JOIN public.assignment_instances ai ON ai.assignment_id = aq.assignment_id
        JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE aq.question_id = question_accepted_answers.question_id
        AND ai.published_at IS NOT NULL
        AND e.student_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "question_tags_all_admin" ON public.question_tags;
CREATE POLICY "question_tags_all_admin"
  ON public.question_tags
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "question_tags_all_teacher_own" ON public.question_tags;
CREATE POLICY "question_tags_all_teacher_own"
  ON public.question_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_tags.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = question_tags.question_id
        AND q.created_by = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "question_tags_select_all_teachers" ON public.question_tags;
CREATE POLICY "question_tags_select_all_teachers"
  ON public.question_tags
  FOR SELECT
  USING ((select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role]));

DROP POLICY IF EXISTS "question_tags_select_enrolled_student" ON public.question_tags;
CREATE POLICY "question_tags_select_enrolled_student"
  ON public.question_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_questions aq
        JOIN public.assignment_instances ai ON ai.assignment_id = aq.assignment_id
        JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE aq.question_id = question_tags.question_id
        AND ai.published_at IS NOT NULL
        AND e.student_id = (select auth.uid())
    )
  );

-- ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assignments_all_admin" ON public.assignments;
CREATE POLICY "assignments_all_admin"
  ON public.assignments
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "assignments_all_teacher_own" ON public.assignments;
CREATE POLICY "assignments_all_teacher_own"
  ON public.assignments
  FOR ALL
  USING (
    created_by = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    created_by = (select auth.uid())
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "assignments_select_all_teachers" ON public.assignments;
CREATE POLICY "assignments_select_all_teachers"
  ON public.assignments
  FOR SELECT
  USING ((select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role]));

DROP POLICY IF EXISTS "assignments_select_enrolled_student" ON public.assignments;
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
        AND e.student_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "assignment_instances_all_admin" ON public.assignment_instances;
CREATE POLICY "assignment_instances_all_admin"
  ON public.assignment_instances
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "assignment_instances_all_teacher_own" ON public.assignment_instances;
CREATE POLICY "assignment_instances_all_teacher_own"
  ON public.assignment_instances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
      WHERE cl.id = assignment_instances.class_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "assignment_instances_select_student" ON public.assignment_instances;
CREATE POLICY "assignment_instances_select_student"
  ON public.assignment_instances
  FOR SELECT
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = (select auth.uid())
        AND e.class_id = assignment_instances.class_id
    )
  );

-- ─── SUBMISSIONS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "submissions_all_admin" ON public.submissions;
CREATE POLICY "submissions_all_admin"
  ON public.submissions
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "submissions_insert_own_student" ON public.submissions;
CREATE POLICY "submissions_insert_own_student"
  ON public.submissions
  FOR INSERT
  WITH CHECK (student_id = (select auth.uid()));

DROP POLICY IF EXISTS "submissions_select_own_student" ON public.submissions;
CREATE POLICY "submissions_select_own_student"
  ON public.submissions
  FOR SELECT
  USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS "submissions_select_teacher_own" ON public.submissions;
CREATE POLICY "submissions_select_teacher_own"
  ON public.submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_instances ai
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE ai.id = submissions.instance_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "submissions_update_own_student" ON public.submissions;
CREATE POLICY "submissions_update_own_student"
  ON public.submissions
  FOR UPDATE
  USING (
    student_id = (select auth.uid())
    AND status = 'in_progress'::public.submission_status
  );

DROP POLICY IF EXISTS "student can upsert own in-progress answers" ON public.submission_answers;
CREATE POLICY "student can upsert own in-progress answers"
  ON public.submission_answers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = (select auth.uid())
        AND s.status = 'in_progress'::public.submission_status
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = (select auth.uid())
        AND s.status = 'in_progress'::public.submission_status
    )
  );

DROP POLICY IF EXISTS "submission_answers_all_admin" ON public.submission_answers;
CREATE POLICY "submission_answers_all_admin"
  ON public.submission_answers
  FOR ALL
  USING ((select public.auth_user_role()) = 'admin');

DROP POLICY IF EXISTS "submission_answers_insert_own_student" ON public.submission_answers;
CREATE POLICY "submission_answers_insert_own_student"
  ON public.submission_answers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = (select auth.uid())
        AND s.status = 'in_progress'::public.submission_status
    )
  );

DROP POLICY IF EXISTS "submission_answers_select_own_student" ON public.submission_answers;
CREATE POLICY "submission_answers_select_own_student"
  ON public.submission_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "submission_answers_select_teacher_own" ON public.submission_answers;
CREATE POLICY "submission_answers_select_teacher_own"
  ON public.submission_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
        JOIN public.assignment_instances ai ON ai.id = s.instance_id
        JOIN public.classes cl ON cl.id = ai.class_id
        JOIN public.courses co ON co.id = cl.course_id
      WHERE s.id = submission_answers.submission_id
        AND co.teacher_id = (select auth.uid())
    )
    AND (select public.auth_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'admin'::public.user_role])
  );

DROP POLICY IF EXISTS "submission_answers_update_own_student" ON public.submission_answers;
CREATE POLICY "submission_answers_update_own_student"
  ON public.submission_answers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.student_id = (select auth.uid())
        AND s.status = 'in_progress'::public.submission_status
    )
  );

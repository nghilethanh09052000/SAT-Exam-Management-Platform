-- Migration: 00022_student_assignment_content_policies.sql
-- Students may read only the assignment/question content that is published to
-- one of their enrolled classes.

CREATE POLICY "assignment_questions_select_enrolled_student"
  ON public.assignment_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignment_instances ai
      JOIN public.enrollments e ON e.class_id = ai.class_id
      WHERE ai.assignment_id = assignment_questions.assignment_id
        AND ai.published_at IS NOT NULL
        AND e.student_id = auth.uid()
    )
  );

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
        AND e.student_id = auth.uid()
    )
  );

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
        AND e.student_id = auth.uid()
    )
  );

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
        AND e.student_id = auth.uid()
    )
  );

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
        AND e.student_id = auth.uid()
    )
  );

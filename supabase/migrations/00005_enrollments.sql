-- Migration: 00005_enrollments.sql
-- Enrollments: links a student to a class (and implicitly to the course)

CREATE TABLE public.enrollments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);

CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_class_id ON public.enrollments(class_id);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Teacher can manage enrollments for their own classes
CREATE POLICY "enrollments_all_teacher_own"
  ON public.enrollments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "enrollments_all_admin"
  ON public.enrollments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Student can read their own enrollment
CREATE POLICY "enrollments_select_own_student"
  ON public.enrollments
  FOR SELECT
  USING (student_id = auth.uid());

-- Migration: 00004_courses_classes_weeks.sql
-- courses, classes, weeks tables

-- ─── COURSES ───────────────────────────────────────────────────────────────

CREATE TABLE public.courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title       TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  expires_at  TIMESTAMPTZ,           -- NULL = never expires
  archived_at TIMESTAMPTZ,           -- NULL = active
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_teacher_id ON public.courses(teacher_id);
CREATE INDEX idx_courses_archived_at ON public.courses(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD their own courses
CREATE POLICY "courses_all_teacher_own"
  ON public.courses
  FOR ALL
  USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "courses_all_admin"
  ON public.courses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- NOTE: "courses_select_enrolled_student" policy (references enrollments)
-- is defined in 00012_rls_cross_table.sql after all tables exist.

-- ─── CLASSES ───────────────────────────────────────────────────────────────

CREATE TABLE public.classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  title           TEXT NOT NULL,
  schedule_text   TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_course_id ON public.classes(course_id);
CREATE INDEX idx_classes_archived_at ON public.classes(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD classes in their own courses
CREATE POLICY "classes_all_teacher_own"
  ON public.classes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.courses co
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE co.id = classes.course_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses co
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE co.id = classes.course_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "classes_all_admin"
  ON public.classes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- NOTE: "classes_select_enrolled_student" policy (references enrollments)
-- is defined in 00012_rls_cross_table.sql after all tables exist.

-- ─── WEEKS ─────────────────────────────────────────────────────────────────

CREATE TABLE public.weeks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  title       TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weeks_class_id ON public.weeks(class_id);

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

-- Teacher can CRUD weeks in their own classes
CREATE POLICY "weeks_all_teacher_own"
  ON public.weeks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = weeks.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

-- Admin full access
CREATE POLICY "weeks_all_admin"
  ON public.weeks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- NOTE: "weeks_select_student" policy (references enrollments)
-- is defined in 00012_rls_cross_table.sql after all tables exist.

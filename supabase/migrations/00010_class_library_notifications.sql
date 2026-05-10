-- Migration: 00010_class_library_notifications.sql
-- class_library_folders, class_library_files, notifications

-- ─── CLASS_LIBRARY_FOLDERS ─────────────────────────────────────────────────

CREATE TABLE public.class_library_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_library_folders_class_id ON public.class_library_folders(class_id);

ALTER TABLE public.class_library_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_library_folders_all_teacher_own"
  ON public.class_library_folders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = class_library_folders.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = class_library_folders.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "class_library_folders_all_admin"
  ON public.class_library_folders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Students can read folders in their enrolled class
CREATE POLICY "class_library_folders_select_student"
  ON public.class_library_folders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.class_id = class_library_folders.class_id
    )
  );

-- ─── CLASS_LIBRARY_FILES ───────────────────────────────────────────────────

CREATE TABLE public.class_library_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    UUID NOT NULL REFERENCES public.class_library_folders(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_type    public.file_type NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_library_files_folder_id ON public.class_library_files(folder_id);

ALTER TABLE public.class_library_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_library_files_all_teacher_own"
  ON public.class_library_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.class_library_folders f
        JOIN public.classes cl ON cl.id = f.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE f.id = class_library_files.folder_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_library_folders f
        JOIN public.classes cl ON cl.id = f.class_id
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE f.id = class_library_files.folder_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "class_library_files_all_admin"
  ON public.class_library_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Enrolled students can read files in their class library
CREATE POLICY "class_library_files_select_student"
  ON public.class_library_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_library_folders f
        JOIN public.enrollments e ON e.class_id = f.class_id
      WHERE f.id = class_library_files.folder_id
        AND e.student_id = auth.uid()
    )
  );

-- ─── NOTIFICATIONS ─────────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  sent_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message    TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_class_id ON public.notifications(class_id);
CREATE INDEX idx_notifications_sent_at ON public.notifications(sent_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_all_teacher_own"
  ON public.notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = notifications.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes cl
        JOIN public.courses co ON co.id = cl.course_id
        JOIN public.profiles p ON p.id = auth.uid()
      WHERE cl.id = notifications.class_id
        AND co.teacher_id = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "notifications_all_admin"
  ON public.notifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Enrolled students can read notifications for their class
CREATE POLICY "notifications_select_student"
  ON public.notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.class_id = notifications.class_id
    )
  );

-- Migration: 00025_file_imports.sql
-- Track uploaded source files for question imports and store originals in Supabase Storage.

CREATE TYPE public.file_import_status AS ENUM (
  'processing',
  'parsed',
  'success',
  'partial_success',
  'failed'
);

CREATE TYPE public.source_file_type AS ENUM (
  'docx',
  'pdf'
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-imports',
  'question-imports',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.file_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  storage_bucket    TEXT NOT NULL DEFAULT 'question-imports',
  storage_path      TEXT NOT NULL,
  file_type         public.source_file_type NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  import_type       TEXT NOT NULL DEFAULT 'questions',
  source_context    TEXT,
  total_records     INTEGER NOT NULL DEFAULT 0,
  success_count     INTEGER NOT NULL DEFAULT 0,
  failure_count     INTEGER NOT NULL DEFAULT 0,
  status            public.file_import_status NOT NULL DEFAULT 'processing',
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_imports_uploaded_by ON public.file_imports(uploaded_by);
CREATE INDEX idx_file_imports_status ON public.file_imports(status);
CREATE INDEX idx_file_imports_created_at ON public.file_imports(created_at DESC);
CREATE UNIQUE INDEX idx_file_imports_storage_object ON public.file_imports(storage_bucket, storage_path);

ALTER TABLE public.file_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_imports_select_teacher_own"
  ON public.file_imports
  FOR SELECT
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "file_imports_select_admin"
  ON public.file_imports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "file_imports_insert_teacher_admin"
  ON public.file_imports
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "file_imports_update_teacher_own"
  ON public.file_imports
  FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  )
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "file_imports_update_admin"
  ON public.file_imports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE TRIGGER set_updated_at_file_imports
  BEFORE UPDATE ON public.file_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

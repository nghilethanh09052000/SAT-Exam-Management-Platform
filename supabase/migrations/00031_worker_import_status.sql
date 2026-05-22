-- Migration: 00031_worker_import_status.sql
-- Status/result tables for Vercel Queue-backed imports.

CREATE TABLE public.file_import_results (
  import_id        UUID PRIMARY KEY REFERENCES public.file_imports(id) ON DELETE CASCADE,
  parsed_payload   JSONB,
  reviewed_payload JSONB,
  parse_errors     JSONB,
  save_errors      JSONB,
  save_result      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_file_import_results
  BEFORE UPDATE ON public.file_import_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.file_import_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_import_results_select_teacher_own"
  ON public.file_import_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.file_imports fi
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE fi.id = import_id
        AND fi.uploaded_by = auth.uid()
        AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "file_import_results_select_admin"
  ON public.file_import_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE TABLE public.student_imports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  class_id       UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'success', 'partial_success', 'failed')),
  total_records  INT NOT NULL DEFAULT 0,
  success_count  INT NOT NULL DEFAULT 0,
  failure_count  INT NOT NULL DEFAULT 0,
  payload        JSONB,
  result         JSONB,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_imports_requested_by ON public.student_imports(requested_by);
CREATE INDEX idx_student_imports_status ON public.student_imports(status);
CREATE INDEX idx_student_imports_created_at ON public.student_imports(created_at DESC);

CREATE TRIGGER set_updated_at_student_imports
  BEFORE UPDATE ON public.student_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.student_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_imports_select_own"
  ON public.student_imports
  FOR SELECT
  USING (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "student_imports_select_admin"
  ON public.student_imports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

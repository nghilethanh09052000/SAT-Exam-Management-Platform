-- Migration: 00006_tags.sql
-- Fixed predefined tag list. No free-text tags allowed.

CREATE TABLE public.tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     public.subject_type NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject, name)
);

CREATE INDEX idx_tags_subject ON public.tags(subject);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read tags
CREATE POLICY "tags_select_authenticated"
  ON public.tags
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only Admin can create/update/delete tags
CREATE POLICY "tags_all_admin"
  ON public.tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

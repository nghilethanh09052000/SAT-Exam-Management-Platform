-- Migration: 00044_latex_storage_path.sql
-- Store the path to the LaTeX/structured-text version of an imported file,
-- saved alongside the original upload when the mapped format is detected.

ALTER TABLE public.file_imports
  ADD COLUMN latex_storage_path TEXT;

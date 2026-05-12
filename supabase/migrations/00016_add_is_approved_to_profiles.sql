-- Migration: 00016_add_is_approved_to_profiles.sql
--
-- Adds is_approved flag to profiles.
-- Only students explicitly imported by admin are approved.
-- When an unknown Google account logs in, is_approved = false → callback rejects them.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing users (seed data, admin, teacher) are considered approved.
UPDATE public.profiles SET is_approved = TRUE;

-- Comment: New students created via /api/admin/students/import will have
-- is_approved set to TRUE after creation. Organic Google signups stay FALSE
-- and get rejected in /api/auth/callback before they can access the app.

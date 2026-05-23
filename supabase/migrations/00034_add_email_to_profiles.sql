-- Migration: 00034_add_email_to_profiles.sql
--
-- Store the application login email on profiles so student registration checks
-- do not depend on listing Supabase Auth users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles p
SET email = lower(u.email)
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN public.profiles.email IS 'Application login email used to match imported students with Google OAuth accounts.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep Auth and application authorization separate. Admin/import code creates
  -- profiles explicitly; arbitrary Auth users must not appear in student lists.
  RETURN NEW;
END;
$$;

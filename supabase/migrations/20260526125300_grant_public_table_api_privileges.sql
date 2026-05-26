-- Migration: grant public schema Data API privileges
--
-- After a remote db reset, Supabase/PostgREST still needs table privileges for
-- anon/authenticated/service_role before RLS policies can allow or deny rows.
-- Without these grants, browser queries fail before RLS is evaluated, e.g.
-- "permission denied for table profiles" after sign-in.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON ROUTINES TO anon, authenticated, service_role;

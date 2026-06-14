-- Migration: 20260614000000_perm_version.sql
-- RBAC follow-up — instant permission propagation (cache-busting).
-- See docs/PERMISSIONS_RBAC_PLAN.md §9.2.
--
-- Problem: the gd_role_cache cookie caches permissions[]/class_ids[] for 5 min, so an
-- admin revoking a grant doesn't take effect until the cookie expires. Solution: a
-- monotonically increasing `perm_version` on profiles, bumped automatically whenever a
-- user's grants or class assignments change. The cookie stores the version it was built
-- with; the auth resolver compares it against the live value (one cheap PK read) and
-- refetches the moment they differ — so revocation is effective on the very next request.

ALTER TABLE public.profiles
  ADD COLUMN perm_version INTEGER NOT NULL DEFAULT 0;

-- Bump the affected user's perm_version on any grant/assignment change. SECURITY DEFINER
-- so it can update profiles regardless of the caller's RLS context (service role, admin
-- via RLS, etc.). Returns NULL (AFTER trigger — return value ignored).
CREATE OR REPLACE FUNCTION public.bump_perm_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET perm_version = perm_version + 1
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_user_permissions_bump_pv
  AFTER INSERT OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.bump_perm_version();

CREATE TRIGGER trg_staff_class_assignments_bump_pv
  AFTER INSERT OR DELETE ON public.staff_class_assignments
  FOR EACH ROW EXECUTE FUNCTION public.bump_perm_version();

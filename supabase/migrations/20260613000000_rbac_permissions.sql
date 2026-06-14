-- Migration: 20260613000000_rbac_permissions.sql
-- RBAC Phase 1 — granular per-user, class-scoped permissions.
-- See docs/PERMISSIONS_RBAC_PLAN.md (§2, §3, §4) and docs/PERMISSIONS_RBAC_AUDIT.md.
--
-- This migration only adds schema + backfill. It does NOT yet enforce anything:
--   * app-layer helpers (requirePermission / requireClassScope) land in Phase 3
--   * RLS policies on existing tables (class_library_files, enrollments, ...) land in Phase 5
-- The two SECURITY DEFINER helpers below are included now because they are tiny and
-- belong with the schema; nothing references them until Phase 5.
--
-- Catalog decisions baked in (see audit F2/F5/F6):
--   * F2: `classes:update` IS included (PATCH /api/classes/[id] exists).
--   * F5: courses & weeks stay owner-only — no permission keys (revisit later).
--   * F6: questions / exam_papers / assignments stay owner-only — no permission keys.

-- ─── PERMISSION ENUM ────────────────────────────────────────────────────────
-- 14 permissions. Stored as an enum so typos are impossible.
CREATE TYPE public.permission AS ENUM (
  'materials:view','materials:create','materials:update','materials:delete',
  'students:view','students:create','students:update','students:delete',
  'performance:view',
  'classes:create','classes:update','classes:delete',
  'grading:view','grading:update'
);

-- ─── PER-USER GRANTS ────────────────────────────────────────────────────────
-- A user "can do X" iff a matching row exists. The admin UI is checkboxes here.
CREATE TABLE public.user_permissions (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission public.permission NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX idx_user_permissions_user_id ON public.user_permissions(user_id);

-- ─── CLASS SCOPING ──────────────────────────────────────────────────────────
-- Which classes a staff member is attached to. Effective access =
--   has the permission AND (target row's class ∈ assigned classes).
-- Owner (admin) is implicitly scoped to ALL classes.
CREATE TABLE public.staff_class_assignments (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);

CREATE INDEX idx_staff_class_assignments_user_id  ON public.staff_class_assignments(user_id);
CREATE INDEX idx_staff_class_assignments_class_id ON public.staff_class_assignments(class_id);

-- ─── AUDIT ──────────────────────────────────────────────────────────────────
-- Every grant/revoke and class assignment change is logged (same spirit as
-- 20260531120000_assistant_audit.sql).
CREATE TABLE public.permission_audit (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- who changed it (owner)
  target_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- whose perms changed
  action     TEXT NOT NULL CHECK (action IN ('grant','revoke','assign_class','unassign_class')),
  detail     TEXT NOT NULL,            -- permission key or class_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_permission_audit_target_id ON public.permission_audit(target_id);
CREATE INDEX idx_permission_audit_created_at ON public.permission_audit(created_at DESC);

-- ─── JOB TITLE (display/filter only — no authz meaning) ──────────────────────
ALTER TABLE public.profiles ADD COLUMN job_title TEXT;

-- ─── SECURITY DEFINER HELPERS (used by Phase 5 RLS; harmless until then) ──────
CREATE OR REPLACE FUNCTION public.auth_user_has(perm public.permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = (select auth.uid()) AND permission = perm
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_user_in_class(cls uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_class_assignments
    WHERE user_id = (select auth.uid()) AND class_id = cls
  )
$$;

-- ─── RLS on the new tables ───────────────────────────────────────────────────
-- These tables are managed via the service-role client (admin UI). RLS here is a
-- backstop: admins manage everything; a user may read their own grants; nobody
-- else can touch them.
ALTER TABLE public.user_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_admin_all" ON public.user_permissions
  FOR ALL USING (public.auth_user_role() = 'admin')
          WITH CHECK (public.auth_user_role() = 'admin');
CREATE POLICY "user_permissions_select_own" ON public.user_permissions
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "staff_class_assignments_admin_all" ON public.staff_class_assignments
  FOR ALL USING (public.auth_user_role() = 'admin')
          WITH CHECK (public.auth_user_role() = 'admin');
CREATE POLICY "staff_class_assignments_select_own" ON public.staff_class_assignments
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "permission_audit_admin_select" ON public.permission_audit
  FOR SELECT USING (public.auth_user_role() = 'admin');

-- ─── BACKFILL ────────────────────────────────────────────────────────────────
-- 1) Attach every teacher to all classes under courses they own, so the new
--    class-scope model matches today's `courses.teacher_id` ownership.
INSERT INTO public.staff_class_assignments (user_id, class_id)
SELECT co.teacher_id, cl.id
FROM public.classes cl
JOIN public.courses co ON co.id = cl.course_id
WHERE co.teacher_id IS NOT NULL
ON CONFLICT (user_id, class_id) DO NOTHING;

-- 2) Grant existing teachers the full permission set, mirroring the unrestricted
--    access they have today. New staff start with zero (the owner ticks boxes).
--    Admins bypass all checks, so they intentionally get no rows here.
INSERT INTO public.user_permissions (user_id, permission)
SELECT p.id, perm
FROM public.profiles p
CROSS JOIN unnest(enum_range(NULL::public.permission)) AS perm
WHERE p.role = 'teacher'
ON CONFLICT (user_id, permission) DO NOTHING;

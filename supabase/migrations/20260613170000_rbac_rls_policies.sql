-- Migration: 20260613170000_rbac_rls_policies.sql
-- RBAC Phase 5 — defense-in-depth RLS on class-scoped tables.
-- See docs/PERMISSIONS_RBAC_PLAN.md §5b / §9.3.
--
-- These policies are ADDITIVE: the existing owner/admin/student policies stay, so no
-- current access is removed (RLS combines policies with OR). They grant the *new* path —
-- a staff member who is ASSIGNED to a class (but may not own its course) and holds the
-- right permission — via the anon/authenticated client. This is a backstop only: almost
-- all staff paths use the service-role client, which bypasses RLS (see §9.3); the
-- app-layer checks from Phases 3-4 remain the real gate.
--
-- Helpers (from 20260613000000): public.auth_user_has(permission), auth_user_in_class(uuid).
-- The non-row-dependent permission check is wrapped in (select ...) so Postgres evaluates
-- it once per query (initplan), matching 00042_fix_rls_initplan_auth_calls.sql. The
-- per-row auth_user_in_class(class_id) cannot be cached (depends on the row).
--
-- Scope notes:
--   * `classes` gets SELECT/UPDATE/DELETE but NO INSERT policy — creating a class can't be
--     class-scoped (no class yet) and must stay course-owner-gated (§9.7); adding an
--     anon INSERT policy would loosen that.
--   * Materials (class_library_files/folders) are deferred — the feature has no app surface
--     yet (F3) and files are scoped via folder_id, needing a subquery. Add when built.

-- ─── enrollments (students:*) ────────────────────────────────────────────────
CREATE POLICY "enrollments_rbac_select" ON public.enrollments
  FOR SELECT
  USING ((select public.auth_user_has('students:view')) AND public.auth_user_in_class(class_id));

CREATE POLICY "enrollments_rbac_insert" ON public.enrollments
  FOR INSERT
  WITH CHECK ((select public.auth_user_has('students:create')) AND public.auth_user_in_class(class_id));

CREATE POLICY "enrollments_rbac_update" ON public.enrollments
  FOR UPDATE
  USING ((select public.auth_user_has('students:update')) AND public.auth_user_in_class(class_id))
  WITH CHECK ((select public.auth_user_has('students:update')) AND public.auth_user_in_class(class_id));

CREATE POLICY "enrollments_rbac_delete" ON public.enrollments
  FOR DELETE
  USING ((select public.auth_user_has('students:delete')) AND public.auth_user_in_class(class_id));

-- ─── classes (classes:* ; SELECT by assignment, no INSERT) ────────────────────
-- No `classes:view` permission exists — being assigned to a class is what lets staff read
-- its row (title/schedule). Bounded to assigned classes; students are never in
-- staff_class_assignments, so this can't leak to them.
CREATE POLICY "classes_rbac_select" ON public.classes
  FOR SELECT
  USING (public.auth_user_in_class(id));

CREATE POLICY "classes_rbac_update" ON public.classes
  FOR UPDATE
  USING ((select public.auth_user_has('classes:update')) AND public.auth_user_in_class(id))
  WITH CHECK ((select public.auth_user_has('classes:update')) AND public.auth_user_in_class(id));

CREATE POLICY "classes_rbac_delete" ON public.classes
  FOR DELETE
  USING ((select public.auth_user_has('classes:delete')) AND public.auth_user_in_class(id));

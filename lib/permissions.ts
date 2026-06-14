/**
 * Canonical permission catalog + access resolution helpers (RBAC Phase 2).
 * See docs/PERMISSIONS_RBAC_PLAN.md.
 *
 * `Permission` mirrors the `public.permission` enum from
 * supabase/migrations/20260613000000_rbac_permissions.sql — keep the two in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Permission, UserRole } from '@/types/database'

export type { Permission }

export const ALL_PERMISSIONS: Permission[] = [
  'materials:view', 'materials:create', 'materials:update', 'materials:delete',
  'questions:view', 'questions:create', 'questions:update', 'questions:delete',
  'students:view', 'students:create', 'students:update', 'students:delete',
  'performance:view',
  'classes:create', 'classes:update', 'classes:delete',
  'grading:view', 'grading:update',
  'exam_papers:view', 'exam_papers:create', 'exam_papers:update', 'exam_papers:delete',
  'assignments:view', 'assignments:create', 'assignments:update', 'assignments:delete',
]

export type UserAccess = {
  permissions: Permission[]
  class_ids: string[]
}

export const EMPTY_ACCESS: UserAccess = { permissions: [], class_ids: [] }

/**
 * Load a user's granted permissions + assigned class ids from the DB.
 *
 * Only staff (`teacher`) carry grants — `admin` bypasses every check (god mode) and
 * `student` has none, so we skip the queries for them and return empty arrays.
 * Accepts either the service-role or the cookie/anon client.
 */
export async function fetchUserAccess(
  db: SupabaseClient<Database>,
  userId: string,
  role: UserRole,
): Promise<UserAccess> {
  if (role !== 'teacher') return { permissions: [], class_ids: [] }

  const [{ data: perms }, { data: assigns }] = await Promise.all([
    db.from('user_permissions').select('permission').eq('user_id', userId),
    db.from('staff_class_assignments').select('class_id').eq('user_id', userId),
  ])

  // Cast: our hand-written Database type omits the Relationships metadata that
  // postgrest-js uses to infer row shapes, so select() resolves to `never` here.
  return {
    permissions: ((perms ?? []) as { permission: Permission }[]).map((r) => r.permission),
    class_ids: ((assigns ?? []) as { class_id: string }[]).map((r) => r.class_id),
  }
}

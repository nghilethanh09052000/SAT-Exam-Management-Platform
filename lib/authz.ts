import type { User } from '@supabase/supabase-js'
import type { createServerClient } from '@/lib/supabase/server'
import type { serviceClient } from '@/lib/supabase/service'
import { serviceClient as createServiceClient } from '@/lib/supabase/service'
import type { UserRole } from '@/types'
import { fetchUserAccess, type Permission } from '@/lib/permissions'

type ServerClient = ReturnType<typeof createServerClient>
type ServiceDb   = ReturnType<typeof serviceClient>

export type AuthProfile = {
  id: string
  role: UserRole
  is_active: boolean
  /** Granted permission keys. Empty for admin (bypasses checks) and students. */
  permissions: Permission[]
  /** Class ids this staff member is assigned to. Empty for admin (= all) and students. */
  class_ids: string[]
}

// ── Session-based auth (used by RSC layouts + legacy routes) ────────────────
// Accepts the anon+cookie client from createServerClient().
export async function getAuthenticatedProfile(supabase: ServerClient): Promise<{
  user: User | null
  profile: AuthProfile | null
}> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!data) return { user, profile: null }

  const base = data as { id: string; role: UserRole; is_active: boolean }
  // Resolve RBAC rows server-side so RSC/API reads do not depend on public grants
  // for the internal permission tables. Middleware and with-auth use the same source.
  const access = await fetchUserAccess(createServiceClient(), base.id, base.role)
  return { user, profile: { ...base, ...access } }
}

export function isTeacherOrAdmin(profile: AuthProfile | null) {
  return profile?.role === 'teacher' || profile?.role === 'admin'
}

// ── RBAC capability checks (Phase 3) ────────────────────────────────────────
// Pure, DB-free predicates over the AuthProfile that Phase 2 now populates.
// `admin` is god mode (always true); everyone else is checked against their
// granted permissions / assigned classes.

/** Does this profile hold `perm`? Admin always does. */
export function hasPermission(profile: AuthProfile | null, perm: Permission): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.permissions.includes(perm)
}

/** Is `classId` within this profile's assigned classes? Admin is scoped to all. */
export function inAssignedClass(profile: AuthProfile | null, classId: string): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.class_ids.includes(classId)
}

// ── RSC helper ──────────────────────────────────────────────────────────────
// Resolve the current user + full profile (with permissions/class_ids) for use
// in Server Component loaders, so pages can enforce/filter the same way routes
// do. Combine with hasPermission / inAssignedClass. See plan §5a.5 / §9.5.
export type AuthContext = { user: User; profile: AuthProfile }

export async function getAuthContext(supabase: ServerClient): Promise<AuthContext | null> {
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user || !profile) return null
  return { user, profile }
}

// ── Ownership assertions for use inside withTeacher handlers ────────────────
// These accept the already-verified ctx from the route wrapper so there is no
// second getUser() call. The db param is the service-role client.

export type AuthzResult = {
  ok: boolean
  status: 401 | 403 | 404
  error: string
}

export const AUTHZ_OK = { ok: true as const }

function authzError(status: AuthzResult['status'], error: string): AuthzResult {
  return { ok: false, status, error }
}

// ── RBAC route guards (Phase 3) ─────────────────────────────────────────────
// Same return shape as the assert* helpers below, so routes use them uniformly:
//   const authz = requirePermission(ctx, 'materials:delete')
//   if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })
// These are synchronous (no DB) — they read the permissions/class_ids already on ctx.

type CapabilityCtx = { profile: AuthProfile }

/** Require that the caller holds `perm` (admin bypasses). */
export function requirePermission(
  ctx: CapabilityCtx,
  perm: Permission
): typeof AUTHZ_OK | AuthzResult {
  return hasPermission(ctx.profile, perm) ? AUTHZ_OK : authzError(403, 'Forbidden')
}

/** Require that `classId` is within the caller's assigned classes (admin bypasses). */
export function requireClassScope(
  ctx: CapabilityCtx,
  classId: string
): typeof AUTHZ_OK | AuthzResult {
  return inAssignedClass(ctx.profile, classId) ? AUTHZ_OK : authzError(403, 'Forbidden')
}

type OwnerCtx = { user: User; profile: AuthProfile; db: ServiceDb }

export async function assertTeacherOwnsWeek(
  ctx: OwnerCtx,
  weekId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await ctx.db
    .from('weeks')
    .select('id')
    .eq('id', weekId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Week not found')
  return AUTHZ_OK
}

export async function assertTeacherOwnsCourse(
  ctx: OwnerCtx,
  courseId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await ctx.db
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Course not found')
  if (data.teacher_id !== ctx.user.id) return authzError(403, 'Forbidden')
  return AUTHZ_OK
}

export async function assertTeacherOwnsClass(
  ctx: OwnerCtx,
  classId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data: cls, error } = await ctx.db
    .from('classes')
    .select('id, course_id')
    .eq('id', classId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!cls) return authzError(404, 'Class not found')

  const { data: course } = await ctx.db
    .from('courses')
    .select('teacher_id')
    .eq('id', cls.course_id)
    .single()

  if (!course || course.teacher_id !== ctx.user.id) return authzError(403, 'Forbidden')
  return AUTHZ_OK
}

export async function assertTeacherOwnsAssignmentInstance(
  ctx: OwnerCtx,
  instanceId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data: instance, error } = await ctx.db
    .from('assignment_instances')
    .select('id, assignment_id, class_id')
    .eq('id', instanceId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!instance) return authzError(404, 'Assignment instance not found')

  const [{ data: assignment }, { data: cls }] = await Promise.all([
    ctx.db.from('assignments').select('created_by').eq('id', instance.assignment_id).single(),
    ctx.db.from('classes').select('course_id').eq('id', instance.class_id).single(),
  ])
  const { data: course } = cls
    ? await ctx.db.from('courses').select('teacher_id').eq('id', cls.course_id).single()
    : { data: null }

  if (
    !assignment || assignment.created_by !== ctx.user.id ||
    !course || course.teacher_id !== ctx.user.id
  ) {
    return authzError(403, 'Forbidden')
  }
  return AUTHZ_OK
}

export async function assertTeacherOwnsAssignment(
  ctx: OwnerCtx,
  assignmentId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await ctx.db
    .from('assignments')
    .select('id, created_by')
    .eq('id', assignmentId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Assignment not found')
  if ((data as { created_by: string }).created_by !== ctx.user.id) return authzError(403, 'Forbidden')
  return AUTHZ_OK
}

export async function assertTeacherOwnsQuestion(
  ctx: OwnerCtx,
  questionId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await ctx.db
    .from('questions')
    .select('id, created_by')
    .eq('id', questionId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Question not found')
  if ((data as { created_by: string }).created_by !== ctx.user.id) return authzError(403, 'Forbidden')
  return AUTHZ_OK
}

export async function assertTeacherOwnsExamPaper(
  ctx: OwnerCtx,
  examPaperId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  if (ctx.profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await ctx.db
    .from('exam_papers')
    .select('id, created_by')
    .eq('id', examPaperId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Practice test not found')
  if ((data as { created_by: string }).created_by !== ctx.user.id) return authzError(403, 'Forbidden')
  return AUTHZ_OK
}

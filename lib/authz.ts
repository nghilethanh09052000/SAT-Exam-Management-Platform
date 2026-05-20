import type { User } from '@supabase/supabase-js'
import type { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

type ServerClient = ReturnType<typeof createServerClient>

export type AuthProfile = {
  id: string
  role: UserRole
  is_active: boolean
}

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

  return { user, profile: (data as AuthProfile | null) ?? null }
}

export function isTeacherOrAdmin(profile: AuthProfile | null) {
  return profile?.role === 'teacher' || profile?.role === 'admin'
}

export type AuthzResult = {
  ok: boolean
  status: 401 | 403 | 404
  error: string
}

export const AUTHZ_OK = { ok: true as const }

function authzError(status: AuthzResult['status'], error: string): AuthzResult {
  return { ok: false, status, error }
}

export async function assertTeacherOwnsWeek(
  supabase: ServerClient,
  weekId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  const { profile } = await getAuthenticatedProfile(supabase)
  if (!profile || !profile.is_active) return authzError(401, 'Unauthorized')
  if (!isTeacherOrAdmin(profile)) return authzError(403, 'Forbidden')
  if (profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await supabase
    .from('weeks')
    .select('id')
    .eq('id', weekId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Week not found')
  return AUTHZ_OK
}

export async function assertTeacherOwnsCourse(
  supabase: ServerClient,
  courseId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  const { profile } = await getAuthenticatedProfile(supabase)
  if (!profile || !profile.is_active) return authzError(401, 'Unauthorized')
  if (!isTeacherOrAdmin(profile)) return authzError(403, 'Forbidden')
  if (profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Course not found')
  return AUTHZ_OK
}

export async function assertTeacherOwnsClass(
  supabase: ServerClient,
  classId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  const { profile } = await getAuthenticatedProfile(supabase)
  if (!profile || !profile.is_active) return authzError(401, 'Unauthorized')
  if (!isTeacherOrAdmin(profile)) return authzError(403, 'Forbidden')
  if (profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Class not found')
  return AUTHZ_OK
}

export async function assertTeacherOwnsAssignmentInstance(
  supabase: ServerClient,
  instanceId: string
): Promise<typeof AUTHZ_OK | AuthzResult> {
  const { profile } = await getAuthenticatedProfile(supabase)
  if (!profile || !profile.is_active) return authzError(401, 'Unauthorized')
  if (!isTeacherOrAdmin(profile)) return authzError(403, 'Forbidden')
  if (profile.role === 'admin') return AUTHZ_OK

  const { data, error } = await supabase
    .from('assignment_instances')
    .select('id')
    .eq('id', instanceId)
    .maybeSingle()

  if (error) return authzError(403, error.message)
  if (!data) return authzError(404, 'Assignment instance not found')
  return AUTHZ_OK
}

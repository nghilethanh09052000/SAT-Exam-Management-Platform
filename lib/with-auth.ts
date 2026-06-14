/**
 * Route wrappers that handle auth boilerplate for Next.js App Router handlers.
 *
 * Usage (static route, no URL params):
 *   export const GET = withTeacher(async (req, { user, db }) => { ... })
 *
 * Usage (dynamic route with URL params):
 *   export const PATCH = withTeacher<{ id: string }>(async (req, { user, db, params }) => {
 *     const { id } = params
 *   })
 *
 * Auth flow:
 *   1. getUser() — verifies JWT with Supabase auth (one network call)
 *   2. Role cache cookie — reads profile from the middleware-maintained cookie
 *      (gd_role_cache, 5-min TTL) — avoids a DB round-trip most of the time
 *   3. Cache miss → service-role profile fetch (always reliable, bypasses RLS)
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import type { AuthProfile } from '@/lib/authz'
import { fetchUserAccess, type Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'

const ROLE_CACHE_COOKIE = 'gd_role_cache'

export type ApiCtx = {
  user: User
  profile: AuthProfile
  db: ReturnType<typeof serviceClient>
}

async function resolveAuth(): Promise<
  { user: User; profile: AuthProfile } | { error: Response }
> {
  const { data: { user } } = await createServerClient().auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) }
  }

  // Try the role cache that middleware keeps fresh (5-min TTL, httpOnly).
  // The cookie carries permissions[] (always — bounded) and class_ids[] (only when it
  // fits; otherwise null = "overflowed", and we re-fetch class_ids from the DB). See
  // docs/PERMISSIONS_RBAC_PLAN.md §9.2.
  const db = serviceClient()
  const cookieStore = cookies()
  const raw = cookieStore.get(ROLE_CACHE_COOKIE)?.value
  if (raw) {
    try {
      const c = JSON.parse(raw) as {
        user_id?: string
        role?: UserRole
        is_active?: boolean
        permissions?: Permission[]
        class_ids?: string[] | null
        perm_version?: number
      }
      // `permissions` + `perm_version` mark a current-shape cookie; older ones fall through.
      if (
        c.user_id === user.id &&
        c.role !== undefined &&
        c.is_active !== undefined &&
        Array.isArray(c.permissions) &&
        typeof c.perm_version === 'number'
      ) {
        // Validate the cache-busting token against the live value (one cheap PK read) so a
        // revoked grant takes effect on the very next request, not after the 5-min TTL.
        const { data: pvRow } = await db
          .from('profiles')
          .select('perm_version')
          .eq('id', user.id)
          .single()
        const livePv = (pvRow as { perm_version: number } | null)?.perm_version
        if (livePv === c.perm_version) {
          const class_ids = Array.isArray(c.class_ids)
            ? c.class_ids
            : (await fetchUserAccess(db, user.id, c.role)).class_ids
          return {
            user,
            profile: { id: user.id, role: c.role, is_active: c.is_active, permissions: c.permissions, class_ids },
          }
        }
        // else: stale token → fall through to a full refetch below.
      }
    } catch { /* fall through to DB */ }
  }

  // Cache miss / stale token: fetch via service-role — bypasses RLS, always works
  const { data } = await db
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!data) {
    return { error: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) }
  }

  const base = data as { id: string; role: UserRole; is_active: boolean }
  const access = await fetchUserAccess(db, base.id, base.role)
  return { user, profile: { ...base, ...access } }
}

function make(requiredRole: UserRole | 'any') {
  return function wrap<P extends Record<string, string> = Record<string, never>>(
    handler: (req: Request, ctx: ApiCtx & { params: P }) => Promise<Response>
  ) {
    return async function (
      req: Request,
      routeCtx?: { params?: P }
    ): Promise<Response> {
      const auth = await resolveAuth()
      if ('error' in auth) return auth.error
      const { user, profile } = auth

      if (!profile.is_active) {
        return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
      }
      if (
        requiredRole === 'teacher' &&
        profile.role !== 'teacher' &&
        profile.role !== 'admin'
      ) {
        return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
      }
      if (requiredRole === 'admin' && profile.role !== 'admin') {
        return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
      }
      if (requiredRole === 'student' && profile.role !== 'student') {
        return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
      }

      const params = (routeCtx?.params ?? {}) as P
      return handler(req, { user, profile, db: serviceClient(), params })
    }
  }
}

export const withTeacher = make('teacher')
export const withAdmin   = make('admin')
export const withStudent = make('student')
export const withAnyAuth = make('any')

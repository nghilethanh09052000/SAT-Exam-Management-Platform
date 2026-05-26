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

  // Try the role cache that middleware keeps fresh (5-min TTL, httpOnly)
  const cookieStore = cookies()
  const raw = cookieStore.get(ROLE_CACHE_COOKIE)?.value
  if (raw) {
    try {
      const c = JSON.parse(raw) as { user_id?: string; role?: UserRole; is_active?: boolean }
      if (c.user_id === user.id && c.role !== undefined && c.is_active !== undefined) {
        return { user, profile: { id: user.id, role: c.role, is_active: c.is_active } }
      }
    } catch { /* fall through to DB */ }
  }

  // Cache miss: fetch via service-role — bypasses RLS, always works
  const { data } = await serviceClient()
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!data) {
    return { error: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user, profile: data as AuthProfile }
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

import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/types'
import type { Database } from '@/types/database'

const DEVICE_SESSION_COOKIE = 'gd_device_session_token'
const DEVICE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
// Cache the user role in a short-lived cookie to avoid fetching profiles on every request
const ROLE_CACHE_COOKIE = 'gd_role_cache'
const ROLE_CACHE_MAX_AGE_SECONDS = 60 * 5 // 5 minutes

/**
 * Route protection rules:
 *   /admin/*   → Admin only       → redirect to /login if not admin
 *   /teacher/* → Teacher + Admin  → redirect to /login if not teacher/admin
 *   /student/* → Student only     → redirect to /login if not student
 *   /login     → Public only when signed out; signed-in users go to their dashboard
 *   All other  → Refresh session, pass through
 */
export async function middleware(request: NextRequest) {
  // Refresh the session cookie and get the current user.
  // MUST use updateSession() so refreshed cookies are in `response`.
  const { user, response } = await updateSession(request)

  const { pathname } = request.nextUrl

  // ─── Public internals ──────────────────────────────────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth')
  ) {
    return response
  }

  // Signed-out users can access the login page.
  if (pathname === '/login' && !user) {
    return response
  }

  // ─── API routes: return 401 JSON instead of redirect ──────────────────────
  // This prevents fetch() in client components from getting an HTML redirect
  // response that it can't parse as JSON.
  if (pathname.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // ─── Not authenticated → redirect to /login ────────────────────────────────
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ─── Get user role using service-role key (bypasses RLS) ──────────────────
  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // ── Role cache: avoid hitting profiles table on every request ──────────────
  // Role is cached in a short-lived cookie (5 min). On cache miss, fetch from DB
  // and repopulate. Cache is intentionally short so role/is_active changes
  // propagate within 5 minutes.
  const roleCacheRaw = request.cookies.get(ROLE_CACHE_COOKIE)?.value
  let profile: { role: UserRole; is_active: boolean } | null = null

  if (roleCacheRaw) {
    try {
      profile = JSON.parse(roleCacheRaw) as { role: UserRole; is_active: boolean }
    } catch {
      profile = null
    }
  }

  if (!profile) {
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    profile = profileData as { role: UserRole; is_active: boolean } | null
    if (profile) {
      response.cookies.set(ROLE_CACHE_COOKIE, JSON.stringify(profile), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ROLE_CACHE_MAX_AGE_SECONDS,
      })
    }
  }

  const role: UserRole | null = profile?.role ?? null

  if (pathname === '/login' && request.nextUrl.searchParams.get('error') === 'device_limit') {
    return response
  }

  // Only redirect when we EXPLICITLY know is_active = false.
  if (profile !== null && !profile.is_active) {
    if (pathname === '/login') {
      return response
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'account_disabled')
    return NextResponse.redirect(loginUrl)
  }

  let deviceSessionToken = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  if (!deviceSessionToken) {
    deviceSessionToken = crypto.randomUUID()
    response.cookies.set(DEVICE_SESSION_COOKIE, deviceSessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
    })
  }

  if (role) {
    const staleBefore = new Date(Date.now() - DEVICE_SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    const now = new Date().toISOString()
    const deviceInfo = request.headers.get('user-agent')?.slice(0, 500) ?? null

    // Run stale-session cleanup + fetch existing sessions in parallel
    const [, { data: existingSessions }] = await Promise.all([
      supabaseAdmin
        .from('device_sessions')
        .delete()
        .eq('user_id', user.id)
        .lt('last_active_at', staleBefore),
      supabaseAdmin
        .from('device_sessions')
        .select('id, session_token')
        .eq('user_id', user.id),
    ])

    const sessions = (existingSessions ?? []) as { id: string; session_token: string }[]
    const currentSession = sessions.find((s) => s.session_token === deviceSessionToken)
    const hasOtherActiveDevice = sessions.some((s) => s.session_token !== deviceSessionToken)

    if (currentSession) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from('device_sessions')
        .update({ device_info: deviceInfo, last_active_at: now, is_violation: hasOtherActiveDevice })
        .eq('id', currentSession.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from('device_sessions')
        .insert({
          user_id: user.id,
          session_token: deviceSessionToken,
          device_info: deviceInfo,
          logged_in_at: now,
          last_active_at: now,
          is_violation: hasOtherActiveDevice,
        })
    }

    if (role === 'student' && hasOtherActiveDevice) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'device_limit')
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname === '/login') {
    switch (role) {
      case 'admin':
        return NextResponse.redirect(new URL('/admin', request.url))
      case 'teacher':
        return NextResponse.redirect(new URL('/teacher', request.url))
      case 'student':
        return NextResponse.redirect(new URL('/student', request.url))
      default:
        return response
    }
  }

  // ─── /admin/* → Admin only ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // ─── /teacher/* → Teacher + Admin ─────────────────────────────────────────
  if (pathname.startsWith('/teacher')) {
    if (role !== 'teacher' && role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // ─── /student/* → Student only ─────────────────────────────────────────────
  if (pathname.startsWith('/student')) {
    if (role !== 'student') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

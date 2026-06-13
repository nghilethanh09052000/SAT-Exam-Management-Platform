import createIntlMiddleware from 'next-intl/middleware'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/types'
import type { Database } from '@/types/database'
import { routing } from '@/i18n/routing'

// Cache the user role in a short-lived cookie to avoid fetching profiles on every request
const ROLE_CACHE_COOKIE = 'gd_role_cache'
const ROLE_CACHE_MAX_AGE_SECONDS = 60 * 5 // 5 minutes

type RoleCache = {
  user_id: string
  role: UserRole
  is_active: boolean
  is_approved: boolean
  full_name: string | null
  avatar_url: string | null
  email: string | null
}

const intlMiddleware = createIntlMiddleware(routing)

/**
 * Redirect while preserving any cookies the session-refresh wrote onto
 * `from`. Supabase rotates refresh tokens (single-use), so dropping the
 * refreshed `sb-*-auth-token` Set-Cookie on a redirect leaves the browser
 * holding an already-consumed token → the next request fails auth and the
 * user gets bounced to login. We also carry the gd_role_cache cookie forward
 * so it actually persists instead of being re-fetched on every navigation.
 */
function redirectPreservingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie)
  }
  return redirect
}

/** Same as above but for rewrites (URL stays in the address bar). */
function rewritePreservingCookies(url: URL, from: NextResponse): NextResponse {
  const rewrite = NextResponse.rewrite(url)
  for (const cookie of from.cookies.getAll()) {
    rewrite.cookies.set(cookie)
  }
  return rewrite
}

/**
 * Route protection rules (locale-aware):
 *   /[locale]/admin/*   → Admin only
 *   /[locale]/teacher/* → Teacher + Admin
 *   /[locale]/student/* → Student only
 *   /[locale]/login     → Public; signed-in users go to their dashboard
 *   Bare paths (no locale) → redirected to /[defaultLocale]/... by intl middleware
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Public internals ──────────────────────────────────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/queues') ||
    pathname === '/api/test-queue'
  ) {
    return NextResponse.next()
  }

  // ─── API routes: return 401 JSON instead of redirect ──────────────────────
  if (pathname.startsWith('/api/')) {
    const { user, response } = await updateSession(request)
    if (!user) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // ─── Detect locale prefix in pathname ─────────────────────────────────────
  const currentLocale = routing.locales.find(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  )

  // No locale prefix → run intl middleware to redirect to locale-prefixed URL
  // e.g. / → /en, /login → /en/login
  if (!currentLocale) {
    return intlMiddleware(request)
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const locale = currentLocale
  const pathWithoutLocale = pathname.slice(`/${locale}`.length) || '/'
  const localePath = (path: string) => new URL(`/${locale}${path}`, request.url)

  // ─── Supabase session refresh ──────────────────────────────────────────────
  const { user, response } = await updateSession(request)

  // ─── Public: signed-out users can access the homepage and login page ──────
  if ((pathWithoutLocale === '/' || pathWithoutLocale === '/login') && !user) {
    return response
  }

  // ─── Hidden staff entrance ─────────────────────────────────────────────────
  // Signed-out visits to /admin and /teacher serve the staff login form via
  // rewrite, so the URL stays /admin while nothing in the UI links to it.
  if (
    !user &&
    (pathWithoutLocale.startsWith('/admin') || pathWithoutLocale.startsWith('/teacher'))
  ) {
    return rewritePreservingCookies(localePath('/staff-portal'), response)
  }

  // Direct hits on the portal route while signed out are allowed (unlinked).
  if (pathWithoutLocale === '/staff-portal' && !user) {
    return response
  }

  // ─── Not authenticated → redirect to /[locale]/login ──────────────────────
  if (!user) {
    const loginUrl = localePath('/login')
    loginUrl.searchParams.set('redirectTo', pathname)
    return redirectPreservingCookies(loginUrl, response)
  }

  // ─── Get user role using service-role key (bypasses RLS) ──────────────────
  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // ── Role cache ──────────────────────────────────────────────────────────────
  const roleCacheRaw = request.cookies.get(ROLE_CACHE_COOKIE)?.value
  type ProfileFields = { role: UserRole; is_active: boolean; is_approved: boolean; full_name: string | null; avatar_url: string | null; email: string | null }
  let profile: ProfileFields | null = null

  if (roleCacheRaw) {
    try {
      const cached = JSON.parse(roleCacheRaw) as Partial<RoleCache>
      if (
        cached.user_id === user.id &&
        cached.role &&
        typeof cached.is_active === 'boolean' &&
        typeof cached.is_approved === 'boolean' &&
        'full_name' in cached  // invalidate old cookies that lack display fields
      ) {
        profile = {
          role: cached.role,
          is_active: cached.is_active,
          is_approved: cached.is_approved,
          full_name: cached.full_name ?? null,
          avatar_url: cached.avatar_url ?? null,
          email: cached.email ?? null,
        }
      } else {
        response.cookies.delete(ROLE_CACHE_COOKIE)
      }
    } catch {
      profile = null
      response.cookies.delete(ROLE_CACHE_COOKIE)
    }
  }

  if (!profile) {
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active, is_approved, full_name, avatar_url')
      .eq('id', user.id)
      .single()
    if (profileData) {
      profile = {
        ...(profileData as { role: UserRole; is_active: boolean; is_approved: boolean; full_name: string | null; avatar_url: string | null }),
        email: user.email ?? null,
      }
      response.cookies.set(
        ROLE_CACHE_COOKIE,
        JSON.stringify({ user_id: user.id, ...profile } satisfies RoleCache),
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: ROLE_CACHE_MAX_AGE_SECONDS,
        }
      )
    }
  }

  const role: UserRole | null = profile?.role ?? null

  // ─── Disabled account ──────────────────────────────────────────────────────
  if (profile !== null && !profile.is_active) {
    if (pathWithoutLocale === '/login') return response
    const loginUrl = localePath('/login')
    loginUrl.searchParams.set('error', 'account_disabled')
    return redirectPreservingCookies(loginUrl, response)
  }

  // ─── Authenticated user on login/staff portal → redirect to dashboard ─────
  if (pathWithoutLocale === '/login' || pathWithoutLocale === '/staff-portal') {
    switch (role) {
      case 'admin':
        return redirectPreservingCookies(localePath('/admin'), response)
      case 'teacher':
        return redirectPreservingCookies(localePath('/teacher'), response)
      case 'student':
        if (profile?.is_approved === true) {
          return redirectPreservingCookies(localePath('/student'), response)
        }
        return response
      default:
        return response
    }
  }

  // ─── /[locale]/admin/* → Admin only ───────────────────────────────────────
  if (pathWithoutLocale.startsWith('/admin')) {
    if (role !== 'admin') {
      return redirectPreservingCookies(localePath('/login'), response)
    }
    return response
  }

  // ─── /[locale]/teacher/* → Teacher + Admin ────────────────────────────────
  if (pathWithoutLocale.startsWith('/teacher')) {
    if (role !== 'teacher' && role !== 'admin') {
      return redirectPreservingCookies(localePath('/login'), response)
    }
    return response
  }

  // ─── /[locale]/student/* → Student only ───────────────────────────────────
  if (pathWithoutLocale.startsWith('/student')) {
    if (role !== 'student' || profile?.is_approved !== true) {
      return redirectPreservingCookies(localePath('/login'), response)
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

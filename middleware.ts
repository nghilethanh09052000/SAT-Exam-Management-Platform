import createIntlMiddleware from 'next-intl/middleware'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { fetchUserAccess, type Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'
import type { Database } from '@/types/database'
import { routing } from '@/i18n/routing'

// Cache the user role in a short-lived cookie to avoid fetching profiles on every request
const ROLE_CACHE_COOKIE = 'gd_role_cache'
const ROLE_CACHE_MAX_AGE_SECONDS = 60 * 5 // 5 minutes
// Cookies cap at ~4 KB. permissions[] is bounded (≤14 short keys) so it always fits;
// class_ids[] is unbounded, so if the serialized cookie would exceed this budget we drop
// class_ids (store null) and the resolver re-fetches them from the DB. See plan §9.2.
const ROLE_CACHE_MAX_BYTES = 3500

type RoleCache = {
  user_id: string
  role: UserRole
  is_active: boolean
  is_approved: boolean
  full_name: string | null
  avatar_url: string | null
  email: string | null
  permissions: Permission[]
  class_ids: string[] | null // null = overflowed; resolver fetches from DB
  perm_version: number       // cache-busting token; resolver refetches if it's stale
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

  // Signed out → drop the role/permission cache. Supabase's client signOut() only clears
  // the sb-* auth cookie, not our custom gd_role_cache, so without this a fresh login
  // would reuse the previous user's cached role + permissions. (Carried through the
  // redirect/rewrite helpers below, which copy all cookies from `response`.)
  if (!user) {
    response.cookies.delete(ROLE_CACHE_COOKIE)
  }

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
        'full_name' in cached &&  // invalidate old cookies that lack display fields
        'permissions' in cached &&  // invalidate pre-RBAC cookies so they get rewritten
        typeof cached.perm_version === 'number'  // invalidate cookies without a version token
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
      .select('role, is_active, is_approved, full_name, avatar_url, perm_version')
      .eq('id', user.id)
      .single()
    if (profileData) {
      const { perm_version, ...profileFields } = profileData as { role: UserRole; is_active: boolean; is_approved: boolean; full_name: string | null; avatar_url: string | null; perm_version: number }
      profile = { ...profileFields, email: user.email ?? null }

      // Load RBAC access (staff only; admin bypasses, student has none) and cache it too.
      const access = await fetchUserAccess(supabaseAdmin, user.id, profile.role)
      let payload: RoleCache = { user_id: user.id, ...profile, ...access, perm_version }
      // Drop class_ids if the cookie would blow the size budget — resolver re-fetches them.
      let serialized = JSON.stringify(payload)
      if (serialized.length > ROLE_CACHE_MAX_BYTES) {
        payload = { ...payload, class_ids: null }
        serialized = JSON.stringify(payload)
      }

      response.cookies.set(ROLE_CACHE_COOKIE, serialized, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ROLE_CACHE_MAX_AGE_SECONDS,
      })
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

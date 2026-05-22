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
}

const intlMiddleware = createIntlMiddleware(routing)

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
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // ─── API routes: return 401 JSON instead of redirect ──────────────────────
  if (pathname.startsWith('/api/')) {
    const { user } = await updateSession(request)
    if (!user) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
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

  // ─── Public: signed-out users can access the login page ───────────────────
  if (pathWithoutLocale === '/login' && !user) {
    return response
  }

  // ─── Not authenticated → redirect to /[locale]/login ──────────────────────
  if (!user) {
    const loginUrl = localePath('/login')
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ─── Get user role using service-role key (bypasses RLS) ──────────────────
  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // ── Role cache ──────────────────────────────────────────────────────────────
  const roleCacheRaw = request.cookies.get(ROLE_CACHE_COOKIE)?.value
  let profile: { role: UserRole; is_active: boolean } | null = null

  if (roleCacheRaw) {
    try {
      const cached = JSON.parse(roleCacheRaw) as Partial<RoleCache>
      if (cached.user_id === user.id && cached.role && typeof cached.is_active === 'boolean') {
        profile = { role: cached.role, is_active: cached.is_active }
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
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    profile = profileData as { role: UserRole; is_active: boolean } | null
    if (profile) {
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
    return NextResponse.redirect(loginUrl)
  }

  // ─── Authenticated user on login → redirect to dashboard ──────────────────
  if (pathWithoutLocale === '/login') {
    switch (role) {
      case 'admin':
        return NextResponse.redirect(localePath('/admin'))
      case 'teacher':
        return NextResponse.redirect(localePath('/teacher'))
      case 'student':
        return NextResponse.redirect(localePath('/student'))
      default:
        return response
    }
  }

  // ─── /[locale]/admin/* → Admin only ───────────────────────────────────────
  if (pathWithoutLocale.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(localePath('/login'))
    }
    return response
  }

  // ─── /[locale]/teacher/* → Teacher + Admin ────────────────────────────────
  if (pathWithoutLocale.startsWith('/teacher')) {
    if (role !== 'teacher' && role !== 'admin') {
      return NextResponse.redirect(localePath('/login'))
    }
    return response
  }

  // ─── /[locale]/student/* → Student only ───────────────────────────────────
  if (pathWithoutLocale.startsWith('/student')) {
    if (role !== 'student') {
      return NextResponse.redirect(localePath('/login'))
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

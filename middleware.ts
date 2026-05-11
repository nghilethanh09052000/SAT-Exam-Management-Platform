import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/types'
import type { Database } from '@/types/database'

/**
 * Route protection rules:
 *   /admin/*   → Admin only       → redirect to /login if not admin
 *   /teacher/* → Teacher + Admin  → redirect to /login if not teacher/admin
 *   /student/* → Student only     → redirect to /login if not student
 *   /login     → Public
 *   All other  → Refresh session, pass through
 */
export async function middleware(request: NextRequest) {
  // Refresh the session cookie and get the current user.
  // MUST use updateSession() so refreshed cookies are in `response`.
  const { user, response } = await updateSession(request)

  const { pathname } = request.nextUrl

  // ─── Public routes ─────────────────────────────────────────────────────────
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth')
  ) {
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
  // Use @supabase/supabase-js createClient directly (NOT @supabase/ssr) so
  // the service-role key is sent as-is without the user's session cookie
  // overriding the Authorization header.
  const supabaseAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  const profile = profileData as { role: UserRole; is_active: boolean } | null

  const role: UserRole | null = profile?.role ?? null

  // Only redirect when we EXPLICITLY know is_active = false.
  if (profile !== null && !profile.is_active) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'account_disabled')
    return NextResponse.redirect(loginUrl)
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

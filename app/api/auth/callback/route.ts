import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

const ROLE_CACHE_COOKIE = 'gd_role_cache'

// Default locale used after OAuth callback — user can switch locale in-app
const DEFAULT_LOCALE = 'en'

function dashboardForRole(role: string | null | undefined) {
  switch (role) {
    case 'admin':
      return `/${DEFAULT_LOCALE}/admin`
    case 'teacher':
      return `/${DEFAULT_LOCALE}/teacher`
    case 'student':
      return `/${DEFAULT_LOCALE}/student`
    default:
      return `/${DEFAULT_LOCALE}`
  }
}

function redirectAndClearRoleCache(url: string) {
  const response = NextResponse.redirect(url)
  response.cookies.delete(ROLE_CACHE_COOKIE)
  return response
}

function safeInternalPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//') ? path : '/'
}

function isFreeTestPath(path: string) {
  return /^\/(en|vi)\/free-test(\/|$)/.test(path)
}

/**
 * OAuth callback handler — exchanges the auth code for a session,
 * then verifies the user is admin-approved before letting them in.
 *
 * Flow:
 *   1. Exchange code → session
 *   2. Check profiles.is_approved
 *      - TRUE  → allow (pre-registered by admin)
 *      - FALSE → sign out + redirect to /login?error=not_registered
 *
 * Google OAuth redirect URL must be set to:
 *   Dev:  http://localhost:54321/auth/v1/callback  (Supabase internal)
 *   Prod: https://<supabase-project>.supabase.co/auth/v1/callback
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // NEXT_PUBLIC_APP_URL overrides the request origin — needed when Next.js runs
  // on a VM/server where request.url resolves to localhost:3000 internally
  // even though the external URL is different (e.g. http://34.55.121.96:3000)
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? new URL(request.url).origin
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  // Provider-level error (e.g. user cancelled Google login)
  if (error) {
    return redirectAndClearRoleCache(
      `${origin}/${DEFAULT_LOCALE}/login?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return redirectAndClearRoleCache(`${origin}/${DEFAULT_LOCALE}/login?error=no_code`)
  }

  const supabase = createServerClient()
  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !sessionData.user) {
    console.error('[auth/callback] Code exchange failed:', exchangeError?.message)
    return redirectAndClearRoleCache(
      `${origin}/${DEFAULT_LOCALE}/login?error=${encodeURIComponent(exchangeError?.message ?? 'exchange_failed')}`
    )
  }

  // ── Check if this user is approved (was imported by admin) ─────────────────
  // Use service role to bypass RLS — we need to read the profile even if
  // the user's session isn't fully wired into the server client yet.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const userEmail = sessionData.user.email?.trim().toLowerCase() ?? null

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email, is_active, is_approved, role')
    .eq('id', sessionData.user.id)
    .maybeSingle()

  // Admin and teacher accounts are always allowed (is_approved may be null on older rows)
  let typedProfile = profile as { id: string; is_active: boolean; is_approved: boolean; role: string; email?: string | null } | null

  // Handle the case where a student was imported via admin (creating a separate auth user)
  // but is now logging in with Google OAuth for the first time. Supabase creates a NEW auth
  // user for the OAuth login — its ID differs from the imported user's ID — so the profile
  // lookup above finds nothing. Detect this by matching on email and migrate the profile to
  // the new OAuth user ID.
  if (!typedProfile && userEmail) {
    const { data: importedProfile } = await adminClient
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url, is_active, is_approved, email, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source, created_at')
      .eq('email', userEmail)
      .eq('is_approved', true)
      .maybeSingle()

    const imp = importedProfile as {
      id: string; role: string; full_name: string; phone?: string | null; avatar_url?: string | null;
      is_active: boolean; is_approved: boolean; email?: string | null; birth_year?: number | null;
      gender?: string | null; school?: string | null; city?: string | null; facebook_url?: string | null;
      threads_url?: string | null; hobbies?: string | null; target_score?: number | null;
      source?: string | null; created_at: string;
    } | null

    if (imp && imp.role === 'student' && imp.is_active) {
      const oldUserId = imp.id
      const newUserId = sessionData.user.id

      try {
        const { id: _old, created_at, ...profileFields } = imp

        // Insert new profile for the Google OAuth user, preserving original created_at
        await adminClient.from('profiles').insert({
          id: newUserId,
          ...profileFields,
          created_at,
          updated_at: new Date().toISOString(),
        })

        // Re-point any class enrollments that reference the old imported user
        await adminClient
          .from('enrollments')
          .update({ student_id: newUserId })
          .eq('student_id', oldUserId)

        // Remove the old profile (CASCADE handles device_sessions, exercise rows etc.)
        await adminClient.from('profiles').delete().eq('id', oldUserId)

        // Remove the orphaned auth user that was created during import
        await adminClient.auth.admin.deleteUser(oldUserId)

        typedProfile = { ...imp, id: newUserId }
      } catch (migrateErr) {
        console.error('[auth/callback] Failed to migrate imported student profile:', migrateErr)
        // Fall through — typedProfile remains null and the guard below will reject the login
      }
    }
  }

  const role = typedProfile?.role
  const isApproved = typedProfile?.is_approved
  const isActive = typedProfile?.is_active
  const emailMatchesProfile = !typedProfile?.email || !userEmail || typedProfile.email.toLowerCase() === userEmail

  const targetPath = next === '/' ? dashboardForRole(role) : safeInternalPath(next)

  if (!typedProfile || !isActive || (role === 'student' && (!isApproved || !emailMatchesProfile) && !isFreeTestPath(targetPath))) {
    // Sign the user out immediately — don't let an unapproved account have a session
    await adminClient.auth.admin.signOut(sessionData.session.access_token)
    return redirectAndClearRoleCache(`${origin}/${DEFAULT_LOCALE}/login?error=not_registered`)
  }

  // All good — redirect to dashboard
  return redirectAndClearRoleCache(`${origin}${targetPath}`)
}

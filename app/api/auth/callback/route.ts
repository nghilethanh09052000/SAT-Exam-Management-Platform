import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

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
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  // Provider-level error (e.g. user cancelled Google login)
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createServerClient()
  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !sessionData.user) {
    console.error('[auth/callback] Code exchange failed:', exchangeError?.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError?.message ?? 'exchange_failed')}`
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

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_approved, role')
    .eq('id', sessionData.user.id)
    .single()

  // Admin and teacher accounts are always allowed (is_approved may be null on older rows)
  const role = (profile as { is_approved: boolean; role: string } | null)?.role
  const isApproved = (profile as { is_approved: boolean; role: string } | null)?.is_approved

  if (role === 'student' && !isApproved) {
    // Sign the user out immediately — don't let an unapproved account have a session
    await adminClient.auth.admin.signOut(sessionData.session.access_token)
    return NextResponse.redirect(`${origin}/login?error=not_registered`)
  }

  // All good — redirect to dashboard
  return NextResponse.redirect(`${origin}${next}`)
}

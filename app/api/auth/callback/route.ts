import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/**
 * OAuth callback handler — exchanges the auth code for a session.
 *
 * Google OAuth redirect URL must be set to:
 *   Dev:  http://localhost:3000/api/auth/callback
 *   Prod: https://<your-domain>/api/auth/callback
 *
 * After successful exchange, redirects to the root page (/) which
 * then routes the user to the correct dashboard based on their role.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  // Google OAuth error (e.g. user cancelled)
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[auth/callback] Code exchange failed:', exchangeError.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    )
  }

  // Successful login — redirect to intended page or root (which routes by role)
  return NextResponse.redirect(`${origin}${next}`)
}

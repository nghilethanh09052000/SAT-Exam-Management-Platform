'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { LoadingSpinner } from '@/components/ui/loading'

export function LoginForm() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  function getErrorMessage(code: string | null): string | null {
    if (!code) return null
    const knownKeys = ['account_disabled', 'invalid_credentials', 'invalid_login_credentials', 'device_limit', 'no_code', 'access_denied', 'not_registered', 'google_error', 'student_google_only']
    const key = knownKeys.includes(code) ? code : 'unknown'
    return t(`errors.${key}`)
  }

  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam === 'not_registered' ? null : getErrorMessage(errorParam)
  )
  const [showNotRegistered, setShowNotRegistered] = useState(
    errorParam === 'not_registered'
  )

  const supabase = createBrowserClient()

  useEffect(() => {
    if (errorParam === 'device_limit') {
      void supabase.auth.signOut()
    }
  }, [errorParam, supabase])

  async function handleGoogleLogin() {
    setError(null)
    setShowNotRegistered(false)
    setGoogleLoading(true)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (oauthError) {
      setError(t('errors.google_error'))
      setGoogleLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-navy-deep">
      {/* Soft navy glow, single accent family */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,108,212,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(31,49,86,0.6),transparent_60%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="GD SAT Platform"
            width={40}
            height={40}
            className="rounded-xl"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-white">
            GD SAT Platform
          </span>
        </Link>
        <LanguageSwitcher variant="dark" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-6">
        <div className="w-full max-w-[440px]">
          <div className="rounded-3xl bg-white p-8 shadow-[0_24px_80px_rgba(7,15,33,0.45)] md:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              {t('welcomeBack')}
            </h1>
            <p className="mt-3 text-sm leading-6 text-mute-light">
              {t('tagline')}
            </p>

            {showNotRegistered && (
              <NotRegisteredAlert onClose={() => setShowNotRegistered(false)} />
            )}

            {error && !showNotRegistered && (
              <div className="mt-6 animate-fade-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-navy text-base font-semibold text-white transition-all duration-200 hover:bg-navy-soft active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <LoadingSpinner className="h-5 w-5 text-white" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                  <GoogleIcon />
                </span>
              )}
              {t('continueWithGoogle')}
            </button>

            <p className="mt-5 text-center text-xs leading-5 text-mute-light">
              {t('studentLoginHint')}
            </p>
          </div>

          <p className="mt-8 text-center text-xs font-medium text-white/50">
            {tCommon('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </main>
    </div>
  )
}

function NotRegisteredAlert({ onClose }: { onClose: () => void }) {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  return (
    <div className="mt-6 animate-fade-in rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-amber-500">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-800">{t('notRegisteredTitle')}</p>
          <p className="mt-1 text-sm font-medium leading-6 text-amber-700/80">
            {t('notRegisteredDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-amber-500/70 transition-colors hover:bg-amber-100 hover:text-amber-700"
          aria-label={tCommon('close')}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { LoadingSpinner } from '@/components/ui/loading'
import type { UserRole } from '@/types'

const inputCls =
  'h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition-all duration-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

const labelCls = 'mb-2 block text-sm font-bold text-slate-700'

type LoginMode = 'choice' | 'staff'

export function LoginForm() {
  const router = useRouter()
  const locale = useLocale()
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

  const [mode, setMode] = useState<LoginMode>(errorParam ? 'staff' : 'choice')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(
        getErrorMessage(signInError.message) ??
          getErrorMessage('invalid_credentials')!
      )
      setLoading(false)
      return
    }

    if (!data.user) {
      setError(getErrorMessage('invalid_credentials'))
      setLoading(false)
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', data.user.id)
      .maybeSingle()

    const profile = profileData as { role: UserRole; is_active: boolean } | null
    const role = profile?.is_active === false ? null : profile?.role

    if (!role) {
      await supabase.auth.signOut()
      setError(getErrorMessage('account_disabled'))
      setLoading(false)
      return
    }

    if (role === 'student') {
      await supabase.auth.signOut()
      setError(t('errors.student_google_only'))
      setLoading(false)
      return
    }

    router.push(role === 'admin' ? `/${locale}/admin` : `/${locale}/teacher`)
    router.refresh()
  }

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

  function openStaffLogin() {
    setMode('staff')
    setError(null)
    setShowNotRegistered(false)
  }

  function backToChoice() {
    setMode('choice')
    setError(null)
  }

  return (
    <div className="grid min-h-screen md:min-h-[calc(100vh-2rem)] lg:grid-cols-[minmax(420px,38%)_1fr]">
      <section className="relative z-10 flex min-h-screen flex-col bg-white px-6 py-8 md:min-h-[calc(100vh-2rem)] md:px-12 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between animate-fade-up">
          <Brand />
          <LanguageSwitcher variant="light" />
        </div>

        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center py-10">
          {showNotRegistered && (
            <NotRegisteredAlert onClose={() => setShowNotRegistered(false)} />
          )}

          {error && !showNotRegistered && (
            <div className="mb-5 animate-fade-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          {mode === 'choice' ? (
            <ChoicePanel
              googleLoading={googleLoading}
              staffLoading={loading}
              onGoogleLogin={handleGoogleLogin}
              onStaffLogin={openStaffLogin}
            />
          ) : (
            <StaffLoginPanel
              email={email}
              password={password}
              loading={loading}
              googleLoading={googleLoading}
              onBack={backToChoice}
              onSubmit={handleEmailLogin}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
            />
          )}
        </div>

        <p className="text-center text-xs font-medium text-slate-400">
          {tCommon('copyright', { year: new Date().getFullYear() })}
        </p>
      </section>

      <IllustrationPanel mode={mode} />
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.jpg"
        alt="GD SAT Platform"
        width={46}
        height={46}
        className="rounded-2xl shadow-xl shadow-blue-500/20"
        priority
      />
      <div>
        <p className="text-xl font-black tracking-tight text-slate-950">
          GD SAT Platform
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
          Duong Gia SAT
        </p>
      </div>
    </div>
  )
}

function ChoicePanel({
  googleLoading,
  staffLoading,
  onGoogleLogin,
  onStaffLogin,
}: {
  googleLoading: boolean
  staffLoading: boolean
  onGoogleLogin: () => void
  onStaffLogin: () => void
}) {
  const t = useTranslations('auth')
  return (
    <div className="animate-fade-up">
      <p className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-blue-500">
        {t('signIn')}
      </p>
      <h1 className="text-4xl font-black tracking-[-0.04em] text-slate-950 md:text-5xl">
        {t('welcomeBack')}
      </h1>
      <p className="mt-4 max-w-md text-base font-medium leading-7 text-slate-500">
        {t('tagline')}
      </p>

      <div className="mt-9 space-y-4">
        <button
          onClick={onGoogleLogin}
          disabled={googleLoading || staffLoading}
          className="group flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
              {googleLoading ? <LoadingSpinner className="h-4 w-4 text-slate-500" /> : <GoogleIcon />}
            </span>
            <span>
              <span className="block text-base font-black text-slate-900">
                {t('studentLogin')}
              </span>
              <span className="mt-0.5 block text-sm font-medium text-slate-500">
                {t('continueWithGoogle')}
              </span>
            </span>
          </span>
          <ArrowRight />
        </button>

        <button
          onClick={onStaffLogin}
          disabled={googleLoading || staffLoading}
          className="group relative flex w-full items-center justify-between overflow-hidden rounded-[22px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-4 text-left text-white shadow-xl shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/15 blur-xl transition-transform duration-500 group-hover:scale-150" />
          <span className="relative flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <StaffIcon />
            </span>
            <span>
              <span className="block text-base font-black">
                {t('teacherAdminLogin')}
              </span>
              <span className="mt-0.5 block text-sm font-medium text-white/70">
                {t('openInternalForm')}
              </span>
            </span>
          </span>
          <span className="relative">
            <ArrowRight />
          </span>
        </button>
      </div>

      <div className="mt-8 rounded-[24px] border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <p className="text-sm font-black text-slate-900">{t('todayMotivation')}</p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          {t('motivationQuote')}
        </p>
      </div>
    </div>
  )
}

function StaffLoginPanel({
  email,
  password,
  loading,
  googleLoading,
  onBack,
  onSubmit,
  onEmailChange,
  onPasswordChange,
}: {
  email: string
  password: string
  loading: boolean
  googleLoading: boolean
  onBack: () => void
  onSubmit: (event: React.FormEvent) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
}) {
  const t = useTranslations('auth')
  return (
    <div className="animate-slide-left">
      <button
        type="button"
        onClick={onBack}
        disabled={loading || googleLoading}
        className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition-all hover:-translate-x-0.5 hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden>←</span>
        {t('backButton')}
      </button>

      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 md:p-8">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-100 blur-3xl" />
        <div className="absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-violet-100 blur-3xl" />

        <div className="relative">
          <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25">
            <StaffIcon />
          </div>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.22em] text-blue-500">
            {t('teacherAdmin')}
          </p>
          <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl">
            {t('adminLogin')}
          </h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
            {t('adminLoginDesc')}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
              <label htmlFor="email" className={labelCls}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                disabled={loading || googleLoading}
                placeholder="admin@sat-platform.local"
                className={inputCls}
              />
            </div>

            <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
              <label htmlFor="password" className={labelCls}>
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                disabled={loading || googleLoading}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-xl shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <LoadingSpinner className="h-4 w-4 text-white" /> : null}
              {t('loginButton')}
              {!loading && <span className="transition-transform group-hover:translate-x-1">→</span>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function NotRegisteredAlert({ onClose }: { onClose: () => void }) {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  return (
    <div className="mb-5 animate-fade-in rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-amber-500">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-amber-800">{t('notRegisteredTitle')}</p>
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

function IllustrationPanel({ mode }: { mode: LoginMode }) {
  const t = useTranslations('auth')
  return (
    <section className="relative hidden overflow-hidden bg-[#fbf4ea] lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(124,58,237,0.12),transparent_30%)]" />

      <FloatingDoodle className="left-[12%] top-[22%] rotate-[-28deg] text-blue-400" delay="0ms">
        <PencilIcon />
      </FloatingDoodle>
      <FloatingDoodle className="right-[14%] top-[33%] rotate-[18deg] text-emerald-400" delay="160ms">
        <NotebookIcon />
      </FloatingDoodle>
      <FloatingDoodle className="left-[18%] bottom-[22%] rotate-[10deg] text-emerald-400" delay="320ms">
        <KeyIcon />
      </FloatingDoodle>
      <FloatingDoodle className="left-[44%] top-[18%] rotate-[-8deg] text-violet-400" delay="460ms">
        <KeyIcon />
      </FloatingDoodle>

      <svg
        className="absolute right-[8%] top-[13%] h-44 w-44 text-slate-300"
        viewBox="0 0 160 160"
        fill="none"
      >
        <path d="M55 12c26 41-24 67 9 83 20 10 34-19 28-33-5-12-22-8-25 4-6 24 33 55 77 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>

      <div className="relative flex h-full min-h-screen items-center justify-center px-10 md:min-h-[calc(100vh-2rem)]">
        <div className="relative h-[620px] w-[700px] max-w-full">
          <PersonCard
            variant="blue"
            className="absolute left-[11%] top-[18%]"
            title={t('studentLoginTitle')}
            subtitle={t('studentLoginSubtitle')}
            active={mode === 'choice'}
          />
          <PersonCard
            variant="violet"
            className="absolute right-[8%] top-[26%]"
            title="Admin"
            subtitle={t('adminLogin')}
            active={mode === 'staff'}
          />

          <div className="absolute bottom-[12%] left-1/2 h-4 w-[440px] -translate-x-1/2 rounded-full bg-slate-900/10 blur-xl" />
          <div className="absolute bottom-[19%] left-1/2 h-[180px] w-[520px] -translate-x-1/2 rounded-t-[30px] bg-gradient-to-t from-blue-400/25 to-blue-300/10" />

          <div className="absolute bottom-[24%] left-[18%] h-48 w-52 rounded-t-[20px] bg-blue-500/80 shadow-2xl shadow-blue-500/20" />
          <div className="absolute bottom-[24%] left-[38%] z-10 h-64 w-64 rounded-t-[24px] bg-blue-500 shadow-2xl shadow-blue-500/25" />
          <div className="absolute bottom-[24%] right-[17%] h-44 w-52 rounded-t-[20px] bg-blue-500/80 shadow-2xl shadow-blue-500/20" />
        </div>
      </div>

      <div className="absolute bottom-10 left-10 right-10 rounded-[28px] border border-white/60 bg-white/35 p-5 shadow-xl shadow-slate-900/5 backdrop-blur-md">
        <p className="text-sm font-black text-slate-900">
          {mode === 'staff' ? t('adminPanel') : t('readyForNewSession')}
        </p>
        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
          {mode === 'staff' ? t('adminPanelDesc') : t('readyForNewSessionDesc')}
        </p>
      </div>
    </section>
  )
}

function FloatingDoodle({
  className,
  delay,
  children,
}: {
  className: string
  delay: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute z-10 h-24 w-24 animate-pop-in opacity-80 ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  )
}

function PersonCard({
  title,
  subtitle,
  variant,
  active,
  className,
}: {
  title: string
  subtitle: string
  variant: 'blue' | 'violet'
  active: boolean
  className: string
}) {
  const gradient =
    variant === 'blue'
      ? 'from-blue-500 to-sky-400'
      : 'from-violet-500 to-fuchsia-400'

  return (
    <div
      className={`z-20 w-60 rounded-[34px] border border-white/70 bg-white/75 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur-md transition-all duration-500 ${
        active ? 'scale-105 opacity-100' : 'scale-95 opacity-80'
      } ${className}`}
    >
      <div className={`mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-5xl font-black text-white shadow-xl`}>
        {title[0]}
      </div>
      <p className="text-center text-lg font-black text-slate-900">{title}</p>
      <p className="mt-1 text-center text-sm font-semibold text-slate-500">{subtitle}</p>
      <div className="mt-5 h-2 rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500 ${active ? 'w-full' : 'w-1/2'}`} />
      </div>
    </div>
  )
}

function ArrowRight() {
  return (
    <svg className="h-5 w-5 text-current opacity-70 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}

function StaffIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" className="h-full w-full">
      <path d="M24 71l7-25 31-31c4-4 11-3 14 2l2 3c3 4 2 10-2 14L45 65 24 71z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M57 20l19 19M31 46l14 19" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function NotebookIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" className="h-full w-full">
      <path d="M25 23l43 12c6 2 10 8 8 14L65 77c-2 6-8 10-14 8L18 75c-5-2-8-7-6-13l10-34c1-4 2-5 3-5z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M39 39l24 7M35 52l24 7M31 65l18 5M36 22l-3 11M50 26l-3 11M64 31l-3 11" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" className="h-full w-full">
      <path d="M37 52a18 18 0 1020-20 18 18 0 00-20 20z" stroke="currentColor" strokeWidth="4" />
      <path d="M38 53H11v14h13v9h12v-9h9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 48h.1" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}

'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { LoadingSpinner } from '@/components/ui/loading'
import type { UserRole } from '@/types'

const inputCls =
  'h-12 w-full rounded-2xl border border-ash-light bg-white px-4 text-sm font-medium text-ink placeholder:text-mute-light/70 outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-mute-light'

export function StaffLoginForm() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError || !data.user) {
      setError(t('errors.invalid_credentials'))
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
      setError(t('errors.account_disabled'))
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

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-navy-deep">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,108,212,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(31,49,86,0.6),transparent_60%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
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
        </div>
        <LanguageSwitcher variant="dark" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-6">
        <div className="w-full max-w-[440px]">
          <div className="rounded-3xl bg-white p-8 shadow-[0_24px_80px_rgba(7,15,33,0.45)] md:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              {t('adminLogin')}
            </h1>
            <p className="mt-3 text-sm leading-6 text-mute-light">
              {t('adminLoginDesc')}
            </p>

            {error && (
              <div className="mt-6 animate-fade-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-ink">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  placeholder="ten@email.com"
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-ink">
                  {t('password')}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-base font-semibold text-white transition-all duration-200 hover:bg-navy-soft active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <LoadingSpinner className="h-5 w-5 text-white" /> : null}
                {t('loginButton')}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-xs font-medium text-white/50">
            {tCommon('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </main>
    </div>
  )
}

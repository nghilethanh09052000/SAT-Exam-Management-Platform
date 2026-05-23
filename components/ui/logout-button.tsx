'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'

interface LogoutButtonProps {
  /** How to render the button: 'icon' for icon-only, 'full' for text + icon */
  variant?: 'icon' | 'full'
  className?: string
}

export function LogoutButton({ variant = 'full', className = '' }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('common')
  const supabase = createBrowserClient()

  async function handleLogout() {
    setLoading(true)
    await supabase.auth.signOut()
    router.push(`/${locale}/login`)
    router.refresh()
  }

  if (variant === 'icon') {
    return (
      <>
        {loading && <LogoutOverlay label={t('logout')} />}
        <button
          onClick={handleLogout}
          disabled={loading}
          title={t('logout')}
          aria-label={t('logout')}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-mute-light hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 ${className}`}
        >
          {loading ? <Spinner /> : <LogoutIcon />}
        </button>
      </>
    )
  }

  return (
    <>
      {loading && <LogoutOverlay label={t('logout')} />}
      <button
        onClick={handleLogout}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors w-full disabled:opacity-40 ${className}`}
      >
        {loading ? <Spinner /> : <LogoutIcon />}
        {t('logout')}
      </button>
    </>
  )
}

function LogoutOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-white/70">{label}…</span>
      </div>
    </div>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

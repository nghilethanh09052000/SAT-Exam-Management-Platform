'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LoadingOverlay, LoadingSpinner } from '@/components/ui/loading'

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
        {loading && <LoadingOverlay label={t('logout')} />}
        <button
          onClick={handleLogout}
          disabled={loading}
          title={t('logout')}
          aria-label={t('logout')}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-mute-light hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 ${className}`}
        >
          {loading ? <LoadingSpinner className="h-4 w-4" label={t('logout')} /> : <LogoutIcon />}
        </button>
      </>
    )
  }

  return (
    <>
      {loading && <LoadingOverlay label={t('logout')} />}
      <button
        onClick={handleLogout}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors w-full disabled:opacity-40 ${className}`}
      >
        {loading ? <LoadingSpinner className="h-4 w-4" label={t('logout')} /> : <LogoutIcon />}
        {t('logout')}
      </button>
    </>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

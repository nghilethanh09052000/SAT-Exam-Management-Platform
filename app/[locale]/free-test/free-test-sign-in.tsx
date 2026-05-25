'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'

export function FreeTestSignIn() {
  const locale = useLocale()
  const t = useTranslations('freeTest')
  const supabase = createBrowserClient()
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/free-test`,
      },
    })
  }

  return (
    <Button onClick={signIn} disabled={loading}>
      {loading ? t('signInLoading') : t('signInBtn')}
    </Button>
  )
}

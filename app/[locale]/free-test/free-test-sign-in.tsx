'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { useAsyncAction } from '@/hooks/use-async'

export function FreeTestSignIn() {
  const locale = useLocale()
  const t = useTranslations('freeTest')
  const supabase = createBrowserClient()

  const { loading, run: signIn } = useAsyncAction(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/free-test`,
      },
    })
  })

  return (
    <Button onClick={signIn} loading={loading}>
      {loading ? t('signInLoading') : t('signInBtn')}
    </Button>
  )
}

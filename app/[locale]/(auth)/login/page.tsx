import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

export default async function LoginPage({
  params,
}: {
  params: { locale: string }
}) {
  const { locale } = params
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('role, is_active, is_approved')
      .eq('id', user.id)
      .maybeSingle()

    const profile = data as { role: UserRole; is_active: boolean; is_approved?: boolean } | null
    const role = profile?.is_active === false ? null : profile?.role

    switch (role) {
      case 'admin':
        redirect(`/${locale}/admin`)
        break
      case 'teacher':
        redirect(`/${locale}/teacher`)
        break
      case 'student':
        if (profile?.is_approved === true) {
          redirect(`/${locale}/student`)
        }
        break
    }
  }

  return (
    <Suspense fallback={<div className="min-h-[100dvh] animate-pulse bg-navy-deep" />}>
      <LoginForm />
    </Suspense>
  )
}

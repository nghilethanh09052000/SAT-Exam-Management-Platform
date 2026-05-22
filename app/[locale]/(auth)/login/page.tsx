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
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    const profile = data as { role: UserRole; is_active: boolean } | null
    const role = profile?.is_active === false ? null : profile?.role

    switch (role) {
      case 'admin':
        redirect(`/${locale}/admin`)
        break
      case 'teacher':
        redirect(`/${locale}/teacher`)
        break
      case 'student':
        redirect(`/${locale}/student`)
        break
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] p-0 text-ink md:p-4">
      <div className="relative min-h-screen overflow-hidden bg-white shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:min-h-[calc(100vh-2rem)] md:rounded-[32px] md:border md:border-slate-200">
        <Suspense fallback={<div className="h-screen animate-pulse bg-slate-100" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}

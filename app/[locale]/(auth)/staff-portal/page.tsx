import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { StaffLoginForm } from './staff-login-form'
import { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

// Hidden staff entrance. Never linked from the UI: unauthenticated requests
// to /admin and /teacher are rewritten here by the middleware, so the URL the
// staff member types (e.g. /vi/admin) stays in the address bar.
export default async function StaffPortalPage({
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

    if (role === 'admin') redirect(`/${locale}/admin`)
    if (role === 'teacher') redirect(`/${locale}/teacher`)
  }

  return (
    <Suspense fallback={<div className="min-h-[100dvh] animate-pulse bg-navy-deep" />}>
      <StaffLoginForm />
    </Suspense>
  )
}

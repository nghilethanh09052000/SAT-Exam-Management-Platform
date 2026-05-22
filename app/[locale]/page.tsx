import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { setRequestLocale } from 'next-intl/server'
import type { UserRole } from '@/types'

export default async function LocaleRootPage({
  params,
}: {
  params: { locale: string }
}) {
  const { locale } = params
  setRequestLocale(locale)

  const supabase = createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = (data as { role: UserRole } | null)?.role

  if (!role) {
    redirect(`/${locale}/login`)
  }

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
    default:
      redirect(`/${locale}/login`)
  }
}

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

/**
 * Root page — reads user role and redirects to the correct dashboard.
 * If not authenticated, middleware already handles redirect to /login.
 */
export default async function RootPage() {
  const supabase = createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = (data as { role: UserRole } | null)?.role

  if (!role) {
    redirect('/login')
  }

  switch (role) {
    case 'admin':
      redirect('/admin')
    case 'teacher':
      redirect('/teacher')
    case 'student':
      redirect('/student')
    default:
      redirect('/login')
  }
}

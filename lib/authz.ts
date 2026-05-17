import type { User } from '@supabase/supabase-js'
import type { createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

type ServerClient = ReturnType<typeof createServerClient>

export type AuthProfile = {
  id: string
  role: UserRole
  is_active: boolean
}

export async function getAuthenticatedProfile(supabase: ServerClient): Promise<{
  user: User | null
  profile: AuthProfile | null
}> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  return { user, profile: (data as AuthProfile | null) ?? null }
}

export function isTeacherOrAdmin(profile: AuthProfile | null) {
  return profile?.role === 'teacher' || profile?.role === 'admin'
}

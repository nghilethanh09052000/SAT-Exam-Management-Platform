import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Database } from '@/types/database'

export function createServerClient() {
  const cookieStore = cookies()

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Components — middleware handles session refresh.
          }
        },
      },
    }
  )
}

/**
 * Returns the authenticated Supabase user, memoized per RSC render tree.
 * Calling this from multiple layouts/pages in the same request makes only
 * ONE network round-trip to Supabase auth instead of one per component.
 */
export const getCachedUser = cache(async () => {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Returns the current user's profile row, memoized per RSC render tree.
 * Fetches full_name, avatar_url, role, is_active, is_approved in one query
 * shared across layout and page components.
 */
export const getCachedProfile = cache(async () => {
  const user = await getCachedUser()
  if (!user) return null
  const supabase = createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, is_active, is_approved')
    .eq('id', user.id)
    .single()
  return data as { full_name: string; avatar_url: string | null; role: string; is_active: boolean; is_approved: boolean } | null
})

'use client'

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * Creates a Supabase client for use in Client Components.
 * Uses @supabase/ssr createBrowserClient which handles cookie storage.
 *
 * Usage:
 *   import { createBrowserClient } from '@/lib/supabase/browser'
 *   const supabase = createBrowserClient()
 */
export function createBrowserClient() {
  return createSupabaseBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

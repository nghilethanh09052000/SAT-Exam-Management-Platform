import { createClient } from '@supabase/supabase-js'

/**
 * Creates an untyped Supabase client for mutations (insert/update).
 * Used to bypass strict type inference issues with complex Database types.
 * Only use for write operations — use createServerClient for reads.
 */
export function createRawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

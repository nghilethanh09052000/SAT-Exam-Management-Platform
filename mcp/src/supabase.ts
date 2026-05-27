/**
 * mcp/src/supabase.ts
 *
 * Creates a Supabase admin client using the service-role key.
 * MCP tools bypass RLS and act on behalf of the platform.
 */

import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function createAdminClient() {
  const url = requireEnv('SUPABASE_URL')
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type AdminClient = ReturnType<typeof createAdminClient>

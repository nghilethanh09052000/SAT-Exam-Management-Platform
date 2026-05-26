import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Extend every table with an empty Relationships array so the type satisfies
// @supabase/postgrest-js 2.105+'s GenericTable constraint, which requires
// Relationships: GenericRelationship[]. Our hand-written Database type predates
// this requirement and does not include foreign-key metadata.
type DatabaseWithRelationships = Database & {
  public: {
    Tables: {
      [K in keyof Database['public']['Tables']]: Database['public']['Tables'][K] & { Relationships: [] }
    }
    Views: Database['public']['Views']
    Functions: Database['public']['Functions']
    Enums: Database['public']['Enums']
  }
}

export function serviceClient() {
  return createClient<DatabaseWithRelationships, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

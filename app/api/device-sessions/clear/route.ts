import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile } from '@/lib/authz'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'

const ClearSessionsSchema = z.object({
  user_id: z.string().min(1),
})

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (profile?.role !== 'admin') {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClearSessionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = adminClient()
  const { data: targetProfile } = await raw
    .from('profiles')
    .select('id, full_name')
    .eq('id', parsed.data.user_id)
    .single()

  const target = targetProfile as { id: string; full_name: string } | null
  if (!target) {
    return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 })
  }

  const { count, error } = await raw
    .from('device_sessions')
    .delete({ count: 'exact' })
    .eq('user_id', parsed.data.user_id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      cleared: count ?? 0,
      user_id: target.id,
      full_name: target.full_name,
    },
    error: null,
  })
}

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = rawClient()
  const { data, error } = await raw
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, full_name, is_active')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

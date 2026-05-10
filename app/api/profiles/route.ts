import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')
  const search = searchParams.get('search')

  let query = supabase
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .order('created_at', { ascending: false })

  const phone = searchParams.get('phone')

  if (role) query = query.eq('role', role)
  if (search) query = query.ilike('full_name', `%${search}%`)
  if (phone) query = query.eq('phone', phone).eq('role', 'student')

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

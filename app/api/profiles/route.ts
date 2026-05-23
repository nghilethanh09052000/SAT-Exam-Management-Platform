import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')
  const search = searchParams.get('search')
  const phone = searchParams.get('phone')?.trim()
  const email = searchParams.get('email')?.trim().toLowerCase()

  if (phone || email) {
    const { user, profile } = await getAuthenticatedProfile(supabase)
    if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
    if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

    const raw = rawClient()
    let query = raw
      .from('profiles')
      .select('id, email, role, full_name, phone, avatar_url, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
      .eq('role', 'student')
      .eq('is_approved', true)

    if (email) {
      query = query.eq('email', email)
    } else if (phone) {
      query = query.eq('phone', phone)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
    return NextResponse.json({ data, error: null })
  }

  let query = supabase
    .from('profiles')
    .select('id, email, role, full_name, phone, avatar_url, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
    .order('created_at', { ascending: false })

  if (role) query = query.eq('role', role)
  if (role === 'student') query = query.eq('is_approved', true)
  if (search) query = query.ilike('full_name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

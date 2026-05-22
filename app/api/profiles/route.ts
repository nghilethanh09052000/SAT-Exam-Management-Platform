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

async function findAuthUserIdByEmail(email: string) {
  const raw = rawClient()
  let page = 1

  while (page <= 20) {
    const { data, error } = await raw.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < 1000) return null
    page += 1
  }

  return null
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
      .select('id, role, full_name, phone, avatar_url, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
      .eq('role', 'student')

    if (email) {
      let userId: string | null
      try {
        userId = await findAuthUserIdByEmail(email)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Không thể tìm email.'
        return NextResponse.json({ data: null, error: message }, { status: 400 })
      }
      if (!userId) return NextResponse.json({ data: [], error: null })
      query = query.eq('id', userId)
    } else if (phone) {
      query = query.eq('phone', phone)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
    return NextResponse.json({ data, error: null })
  }

  let query = supabase
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
    .order('created_at', { ascending: false })

  if (role) query = query.eq('role', role)
  if (search) query = query.ilike('full_name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

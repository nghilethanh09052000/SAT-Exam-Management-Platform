import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile } from '@/lib/authz'
import type { UserRole } from '@/types/database'

export const runtime = 'nodejs'

type StaffRole = Extract<UserRole, 'admin' | 'teacher'>

const UpdateStaffSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'teacher']).optional(),
  is_active: z.boolean().optional(),
})

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function requireAdmin() {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return { error: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) }
  if (profile?.role !== 'admin') return { error: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) }
  return { user, profile }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateStaffSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const raw = adminClient()
  const update = parsed.data

  if (params.id === auth.user.id && update.role && update.role !== 'admin') {
    return NextResponse.json({ data: null, error: 'Bạn không thể tự gỡ quyền admin của chính mình.' }, { status: 400 })
  }
  if (params.id === auth.user.id && update.is_active === false) {
    return NextResponse.json({ data: null, error: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình.' }, { status: 400 })
  }

  if (update.role && update.role !== 'admin') {
    const { count } = await raw
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
    const { data: target } = await raw.from('profiles').select('role, is_active').eq('id', params.id).single()
    const targetProfile = target as { role: string; is_active: boolean } | null
    if (targetProfile?.role === 'admin' && targetProfile.is_active && (count ?? 0) <= 1) {
      return NextResponse.json({ data: null, error: 'Cần giữ lại ít nhất một admin đang hoạt động.' }, { status: 400 })
    }
  }

  if (update.is_active === false) {
    const { data: target } = await raw.from('profiles').select('role, is_active').eq('id', params.id).single()
    const targetProfile = target as { role: string; is_active: boolean } | null
    if (targetProfile?.role === 'admin' && targetProfile.is_active) {
      const { count } = await raw
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true)
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ data: null, error: 'Cần giữ lại ít nhất một admin đang hoạt động.' }, { status: 400 })
      }
    }
  }

  if (update.role || update.full_name) {
    const { data: userData } = await raw.auth.admin.getUserById(params.id)
    const metadata = userData.user?.user_metadata ?? {}
    const { error: authError } = await raw.auth.admin.updateUserById(params.id, {
      user_metadata: {
        ...metadata,
        ...(update.role ? { role: update.role } : {}),
        ...(update.full_name ? { full_name: update.full_name } : {}),
      },
    })
    if (authError) return NextResponse.json({ data: null, error: authError.message }, { status: 400 })
  }

  const { data, error } = await raw
    .from('profiles')
    .update({ ...update, updated_at: new Date().toISOString() } as {
      full_name?: string
      phone?: string | null
      role?: StaffRole
      is_active?: boolean
      updated_at: string
    })
    .eq('id', params.id)
    .in('role', ['admin', 'teacher'])
    .select('id, role, full_name, phone, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

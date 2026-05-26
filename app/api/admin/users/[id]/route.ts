import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/with-auth'
import type { UserRole } from '@/types/database'

export const runtime = 'nodejs'

type StaffRole = Extract<UserRole, 'admin' | 'teacher'>

const UpdateStaffSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'teacher']).optional(),
  is_active: z.boolean().optional(),
})

export const PATCH = withAdmin<{ id: string }>(async (req, { user, db, params }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateStaffSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const update = parsed.data

  if (params.id === user.id && update.role && update.role !== 'admin') {
    return NextResponse.json({ data: null, error: 'Bạn không thể tự gỡ quyền admin của chính mình.' }, { status: 400 })
  }
  if (params.id === user.id && update.is_active === false) {
    return NextResponse.json({ data: null, error: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình.' }, { status: 400 })
  }

  if (update.role && update.role !== 'admin') {
    const { count } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
    const { data: target } = await db.from('profiles').select('role, is_active').eq('id', params.id).single()
    const t = target as { role: string; is_active: boolean } | null
    if (t?.role === 'admin' && t.is_active && (count ?? 0) <= 1) {
      return NextResponse.json({ data: null, error: 'Cần giữ lại ít nhất một admin đang hoạt động.' }, { status: 400 })
    }
  }

  if (update.is_active === false) {
    const { data: target } = await db.from('profiles').select('role, is_active').eq('id', params.id).single()
    const t = target as { role: string; is_active: boolean } | null
    if (t?.role === 'admin' && t.is_active) {
      const { count } = await db
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
    const { data: userData } = await db.auth.admin.getUserById(params.id)
    const metadata = userData.user?.user_metadata ?? {}
    const { error: authError } = await db.auth.admin.updateUserById(params.id, {
      user_metadata: {
        ...metadata,
        ...(update.role      ? { role:      update.role }      : {}),
        ...(update.full_name ? { full_name: update.full_name } : {}),
      },
    })
    if (authError) return NextResponse.json({ data: null, error: authError.message }, { status: 400 })
  }

  const { data, error } = await db
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
})

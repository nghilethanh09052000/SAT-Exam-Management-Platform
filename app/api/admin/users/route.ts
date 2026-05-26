import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/with-auth'
import type { UserRole } from '@/types/database'

export const runtime = 'nodejs'

type StaffRole = Extract<UserRole, 'admin' | 'teacher'>

const CreateStaffSchema = z.object({
  full_name: z.string().min(1, 'Họ tên không được để trống'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự'),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'teacher']),
})

export const POST = withAdmin(async (req, { db }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateStaffSchema.safeParse(body)
  if (!parsed.success) {
    const firstErr = parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'
    return NextResponse.json({ data: null, error: firstErr }, { status: 400 })
  }

  const staff = parsed.data

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: staff.email,
    password: staff.password,
    email_confirm: true,
    user_metadata: { role: staff.role, full_name: staff.full_name },
  })

  if (createError || !created.user) {
    return NextResponse.json(
      { data: null, error: createError?.message ?? 'Không thể tạo tài khoản.' },
      { status: 400 }
    )
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .upsert({
      id: created.user.id,
      email: staff.email.toLowerCase(),
      role: staff.role as StaffRole,
      full_name: staff.full_name,
      phone: staff.phone ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id, role, full_name, phone, is_active, created_at')
    .single()

  if (profileError) {
    return NextResponse.json({ data: null, error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({
    data: { ...profile, email: created.user.email ?? staff.email, last_sign_in_at: created.user.last_sign_in_at ?? null },
    error: null,
  })
})

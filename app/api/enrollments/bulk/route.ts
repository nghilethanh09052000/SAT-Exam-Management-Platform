/**
 * POST /api/enrollments/bulk — bulk-enroll students by phone number.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsClass } from '@/lib/authz'

const BulkSchema = z.object({
  class_id: z.string().min(1),
  phones: z.array(z.string()).min(1),
})

export const POST = withTeacher(async (request, { user, profile, db }) => {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ data: null, error: 'Body không hợp lệ.' }, { status: 400 })

  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { class_id, phones } = parsed.data

  const authz = await assertTeacherOwnsClass({ user, profile, db }, class_id)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const normalizedPhones = phones.map((p) => p.trim()).filter(Boolean)

  const { data: profiles, error: profileErr } = await db
    .from('profiles')
    .select('id, phone')
    .in('phone', normalizedPhones)
    .eq('role', 'student')

  if (profileErr) return NextResponse.json({ data: null, error: profileErr.message }, { status: 500 })

  const matchedProfiles = (profiles ?? []) as { id: string; phone: string }[]
  const foundPhones = new Set(matchedProfiles.map((p) => p.phone))
  const notFound = normalizedPhones.filter((p) => !foundPhones.has(p))

  if (matchedProfiles.length === 0) {
    return NextResponse.json({
      data: { enrolled: 0, not_found: notFound },
      error: 'Không tìm thấy học sinh nào khớp với số điện thoại đã cung cấp.',
    })
  }

  const { error: insertErr } = await db
    .from('enrollments')
    .upsert(
      matchedProfiles.map((p) => ({ class_id, student_id: p.id })),
      { onConflict: 'class_id,student_id', ignoreDuplicates: true }
    )

  if (insertErr) return NextResponse.json({ data: null, error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    data: { enrolled: matchedProfiles.length, not_found: notFound },
    error: null,
  })
})

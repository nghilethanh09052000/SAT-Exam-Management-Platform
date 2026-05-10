/**
 * POST /api/enrollments/bulk
 * Bulk-enroll students from an Excel sheet.
 *
 * Body: { class_id, rows: Array<{ phone: string }> }
 * Matches each row's phone against the profiles table.
 * Returns { enrolled, not_found } counts.
 */

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

const BulkSchema = z.object({
  class_id: z.string().uuid(),
  phones: z.array(z.string()).min(1),
})

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Body không hợp lệ.' }, { status: 400 })
  }

  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { class_id, phones } = parsed.data
  const raw = rawClient()

  // Normalize phones (trim, remove leading zeros in some formats)
  const normalizedPhones = phones.map((p) => p.trim()).filter(Boolean)

  // Find matching student profiles
  const { data: profiles, error: profileErr } = await raw
    .from('profiles')
    .select('id, phone')
    .in('phone', normalizedPhones)
    .eq('role', 'student')

  if (profileErr) {
    return NextResponse.json({ data: null, error: profileErr.message }, { status: 500 })
  }

  const matchedProfiles = (profiles ?? []) as { id: string; phone: string }[]
  const foundPhones = new Set(matchedProfiles.map((p) => p.phone))
  const notFound = normalizedPhones.filter((p) => !foundPhones.has(p))

  if (matchedProfiles.length === 0) {
    return NextResponse.json({
      data: { enrolled: 0, not_found: notFound },
      error: 'Không tìm thấy học sinh nào khớp với số điện thoại đã cung cấp.',
    })
  }

  // Bulk upsert enrollments
  const enrollments = matchedProfiles.map((p) => ({
    class_id,
    student_id: p.id,
  }))

  const { error: insertErr } = await raw
    .from('enrollments')
    .upsert(enrollments, { onConflict: 'class_id,student_id', ignoreDuplicates: true })

  if (insertErr) {
    return NextResponse.json({ data: null, error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    data: { enrolled: matchedProfiles.length, not_found: notFound },
    error: null,
  })
}

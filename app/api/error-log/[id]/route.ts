import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpdateErrorLogSchema = z.object({
  student_note: z.string().nullable(),
})

export const PATCH = withAnyAuth<{ id: string }>(async (req, { user, db, params }) => {
  const body = await req.json()
  const parsed = UpdateErrorLogSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data, error } = await db
    .from('error_log')
    .update({
      student_note: parsed.data.student_note,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', params.id)
    .eq('student_id', user.id)
    .select('id, student_note')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

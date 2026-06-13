/**
 * POST /api/assignment-extensions — grant or update a per-student deadline
 * extension for one assignment instance. DELETE removes it.
 * Ownership is enforced by RLS (teacher of the course, or admin).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpsertSchema = z.object({
  instance_id: z.string().min(1),
  student_id: z.string().min(1),
  extended_deadline: z.string().min(1),
  note: z.string().nullable().optional(),
})

const DeleteSchema = z.object({
  instance_id: z.string().min(1),
  student_id: z.string().min(1),
})

export const POST = withTeacher(async (req, { user, db }) => {
  const body = await req.json()
  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data, error } = await db
    .from('assignment_extensions')
    .upsert(
      {
        instance_id: parsed.data.instance_id,
        student_id: parsed.data.student_id,
        extended_deadline: new Date(parsed.data.extended_deadline).toISOString(),
        note: parsed.data.note ?? null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'instance_id,student_id' }
    )
    .select('id, instance_id, student_id, extended_deadline')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const DELETE = withTeacher(async (req, { db }) => {
  const body = await req.json()
  const parsed = DeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { error } = await db
    .from('assignment_extensions')
    .delete()
    .eq('instance_id', parsed.data.instance_id)
    .eq('student_id', parsed.data.student_id)

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true }, error: null })
})

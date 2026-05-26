/**
 * PATCH /api/questions/[id]/tag
 * Teacher override for a question's skill category (replaces all existing tags).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { assertTeacherOwnsQuestion } from '@/lib/authz'

export const runtime = 'nodejs'

const PatchTagSchema = z.object({
  tag_id: z.string().uuid('tag_id phải là UUID hợp lệ.'),
})

export const PATCH = withTeacher<{ id: string }>(async (request, { user, profile, db, params }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Request body không hợp lệ.' }, { status: 400 })
  }

  const parsed = PatchTagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' },
      { status: 400 }
    )
  }

  const { tag_id } = parsed.data
  const questionId = params.id

  const authz = await assertTeacherOwnsQuestion({ user, profile, db }, questionId)
  if (!authz.ok) return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })

  const { data: tag, error: tagError } = await (db as any)
    .from('tags')
    .select('id, subject, name')
    .eq('id', tag_id)
    .single()

  if (tagError || !tag) {
    return NextResponse.json({ data: null, error: 'Tag không tồn tại.' }, { status: 404 })
  }

  const { error: deleteError } = await (db as any).from('question_tags').delete().eq('question_id', questionId)
  if (deleteError) {
    return NextResponse.json({ data: null, error: 'Không thể cập nhật tag: ' + deleteError.message }, { status: 500 })
  }

  const { error: insertError } = await (db as any).from('question_tags').insert({
    question_id: questionId,
    tag_id,
    confidence: 'manual',
  })
  if (insertError) {
    return NextResponse.json({ data: null, error: 'Không thể lưu tag: ' + insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: { question_id: questionId, tag_id, tag_name: (tag as { name: string }).name, confidence: 'manual' },
    error: null,
  })
})

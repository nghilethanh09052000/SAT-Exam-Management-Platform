/**
 * PATCH /api/questions/[id]/tag
 * Teacher override for a question's skill category.
 *
 * Replaces the existing skill tag with the supplied tag_id and marks
 * confidence = 'manual' so the UI no longer shows the ⚠ review flag.
 *
 * Request body:
 *   { tag_id: string }   ← UUID from the tags table
 *
 * Response:
 *   { data: { question_id, tag_id }, error: null }
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'

const PatchTagSchema = z.object({
  tag_id: z.string().uuid('tag_id phải là UUID hợp lệ.'),
})

function rawClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)

  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Bạn không có quyền thực hiện hành động này.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = rawClient() as any

  // Verify the question exists and the caller owns it (unless admin)
  const { data: question, error: qError } = await raw
    .from('questions')
    .select('id, created_by')
    .eq('id', questionId)
    .is('archived_at', null)
    .single()

  if (qError || !question) {
    return NextResponse.json({ data: null, error: 'Câu hỏi không tồn tại.' }, { status: 404 })
  }

  if (profile?.role !== 'admin' && (question as { created_by: string }).created_by !== user.id) {
    return NextResponse.json({ data: null, error: 'Bạn không có quyền chỉnh sửa câu hỏi này.' }, { status: 403 })
  }

  // Verify the tag exists
  const { data: tag, error: tagError } = await raw
    .from('tags')
    .select('id, subject, name')
    .eq('id', tag_id)
    .single()

  if (tagError || !tag) {
    return NextResponse.json({ data: null, error: 'Tag không tồn tại.' }, { status: 404 })
  }

  // Replace all existing skill tags for this question with the new one.
  // We delete all tags for this question then insert the new one.
  // (A question should only have one skill tag at a time.)
  const { error: deleteError } = await raw
    .from('question_tags')
    .delete()
    .eq('question_id', questionId)

  if (deleteError) {
    return NextResponse.json(
      { data: null, error: 'Không thể cập nhật tag: ' + (deleteError as { message: string }).message },
      { status: 500 }
    )
  }

  const { error: insertError } = await raw.from('question_tags').insert({
    question_id: questionId,
    tag_id,
    confidence: 'manual',
  })

  if (insertError) {
    return NextResponse.json(
      { data: null, error: 'Không thể lưu tag: ' + (insertError as { message: string }).message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: { question_id: questionId, tag_id, tag_name: (tag as { name: string }).name, confidence: 'manual' },
    error: null,
  })
}

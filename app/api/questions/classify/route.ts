/**
 * POST /api/questions/classify
 * Rule-based category classification — no AI, no external API.
 *
 * Used by:
 *   - Upload review UI: suggest category while teacher reviews parsed questions
 *   - Manual question creation form: suggest as teacher types
 *
 * Request body:
 *   { text: string, subject: 'reading_writing' | 'math' }
 *
 * Response:
 *   { data: { category, confidence, score }, error: null }
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import { classifyQuestion } from '@/lib/categorization/classifier'

export const runtime = 'nodejs'

const ClassifyRequestSchema = z.object({
  text: z.string().min(1, 'Nội dung câu hỏi không được để trống.'),
  subject: z.enum(['reading_writing', 'math']),
})

export async function POST(request: Request) {
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

  const parsed = ClassifyRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' },
      { status: 400 }
    )
  }

  const { text, subject } = parsed.data
  const result = classifyQuestion(text, subject)

  return NextResponse.json({ data: result, error: null })
}

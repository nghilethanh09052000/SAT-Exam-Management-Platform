/**
 * POST /api/questions/classify
 * Rule-based category classification — no AI, no external API.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { classifyQuestion } from '@/lib/categorization/classifier'

export const runtime = 'nodejs'

const ClassifyRequestSchema = z.object({
  text: z.string().min(1, 'Nội dung câu hỏi không được để trống.'),
  subject: z.enum(['reading_writing', 'math']),
})

export const POST = withTeacher(async (request) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ data: null, error: 'Request body không hợp lệ.' }, { status: 400 })
  }

  const parsed = ClassifyRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ data: classifyQuestion(parsed.data.text, parsed.data.subject), error: null })
})

/**
 * POST /api/questions/bulk-save
 * Saves the teacher-reviewed parsed questions to the question bank.
 * Skips questions marked skip=true (teacher chose to skip duplicates).
 * Replaces questions marked replace=true (teacher chose to overwrite duplicate).
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

const OptionSchema = z.object({
  label: z.string(),
  content: z.string(),
  is_correct: z.boolean(),
  order: z.number(),
})

const QuestionSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['multiple_choice', 'short_answer']),
  content_hash: z.string(),
  image_url: z.string().nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  module: z.string().optional(),
  // Teacher-assigned in review step
  tag_id: z.string().min(1).nullable().optional(),
  // Options / answers
  options: z.array(OptionSchema).optional(),
  accepted_answers: z.array(z.string()).optional(),
  // Dedup action
  skip: z.boolean().optional(),       // true = skip this question
  replace: z.boolean().optional(),    // true = delete existing and re-insert
  is_duplicate: z.boolean().optional(),
})

const BulkSaveSchema = z.object({
  questions: z.array(QuestionSchema),
})

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Request body không hợp lệ.' }, { status: 400 })
  }

  const parsed = BulkSaveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: `Dữ liệu không hợp lệ: ${parsed.error.message}` },
      { status: 400 }
    )
  }

  const questions = parsed.data.questions.filter((q) => !q.skip)
  if (questions.length === 0) {
    return NextResponse.json({ data: { saved: 0 }, error: null })
  }

  const raw = rawClient()
  let saved = 0
  const savedIds: string[] = []
  const saveErrors: { content: string; error: string }[] = []

  for (const q of questions) {
    try {
      // If teacher chose to replace an existing duplicate, delete the old one first
      if (q.replace && q.is_duplicate) {
        await raw
          .from('questions')
          .delete()
          .eq('content_hash', q.content_hash)
      }

      // Insert question
      const { data: newQ, error: qError } = await raw
        .from('questions')
        .insert({
          created_by: user.id,
          type: q.type,
          content: q.content,
          content_hash: q.content_hash,
          image_url: q.image_url ?? null,
          difficulty: q.difficulty ?? null,
        })
        .select('id')
        .single()

      if (qError || !newQ) {
        if (qError?.code === '23505') {
          // Hash already exists — fetch the existing ID so it can be linked to the assignment
          const { data: existing } = await raw
            .from('questions')
            .select('id')
            .eq('content_hash', q.content_hash)
            .single()
          if (existing) savedIds.push(existing.id)
          continue
        }
        saveErrors.push({ content: q.content.slice(0, 60), error: qError?.message ?? 'Lỗi không xác định' })
        continue
      }

      const questionId = newQ.id

      // Insert options (multiple choice)
      if (q.type === 'multiple_choice' && q.options && q.options.length > 0) {
        await raw.from('question_options').insert(
          q.options.map((o) => ({
            question_id: questionId,
            label: o.label,
            content: o.content,
            is_correct: o.is_correct,
            order: o.order,
          }))
        )
      }

      // Insert accepted answers (short answer)
      if (q.type === 'short_answer' && q.accepted_answers && q.accepted_answers.length > 0) {
        await raw.from('question_accepted_answers').insert(
          q.accepted_answers.map((a) => ({
            question_id: questionId,
            answer_text: a,
          }))
        )
      }

      // Link to tag (if teacher picked one)
      if (q.tag_id) {
        await raw.from('question_tags').insert({
          question_id: questionId,
          tag_id: q.tag_id,
        })
      }

      savedIds.push(questionId)
      saved++
    } catch (err) {
      saveErrors.push({
        content: q.content.slice(0, 60),
        error: err instanceof Error ? err.message : 'Lỗi không xác định',
      })
    }
  }

  return NextResponse.json({
    data: { saved, savedIds, errors: saveErrors },
    error: saveErrors.length > 0 ? `${saveErrors.length} câu hỏi không thể lưu.` : null,
  })
}

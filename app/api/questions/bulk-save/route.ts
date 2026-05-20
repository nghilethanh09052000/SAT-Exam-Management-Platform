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
import { updateFileImportStatus } from '@/lib/import-files'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

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
  teacher_explanation: z.string().nullable().optional(),
  module: z.string().optional(),
  category: z.string().nullable().optional(),
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
  upload_import_id: z.string().uuid().optional(),
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
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
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
    if (parsed.data.upload_import_id) {
      const raw = rawClient()
      await updateFileImportStatus({
        raw,
        importId: parsed.data.upload_import_id,
        status: parsed.data.questions.length > 0 ? 'partial_success' : 'success',
        totalRecords: parsed.data.questions.length,
        successCount: 0,
        failureCount: parsed.data.questions.length,
        errorMessage: null,
      })
    }
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
          teacher_explanation: q.teacher_explanation?.trim() || null,
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

      const tagId = q.tag_id ?? (q.category ? await ensureCategoryTag(raw, q.category, q.module) : null)

      // Link to tag (if teacher picked one or the import included a category)
      if (tagId) {
        await raw.from('question_tags').insert({
          question_id: questionId,
          tag_id: tagId,
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

  if (parsed.data.upload_import_id) {
    const failureCount = saveErrors.length + parsed.data.questions.filter((q) => q.skip).length
    await updateFileImportStatus({
      raw,
      importId: parsed.data.upload_import_id,
      status: failureCount > 0 ? 'partial_success' : 'success',
      totalRecords: parsed.data.questions.length,
      successCount: saved,
      failureCount,
      errorMessage: saveErrors.length > 0 ? `${saveErrors.length} câu hỏi không thể lưu.` : null,
    })
  }

  return NextResponse.json({
    data: { saved, savedIds, errors: saveErrors },
    error: saveErrors.length > 0 ? `${saveErrors.length} câu hỏi không thể lưu.` : null,
  })
}

async function ensureCategoryTag(
  raw: ReturnType<typeof rawClient>,
  category: string,
  module?: string
): Promise<string | null> {
  const name = category.trim()
  if (!name) return null

  const subject = module && /math/i.test(module) ? 'math' : 'reading_writing'
  const { data: existing } = await raw
    .from('tags')
    .select('id')
    .eq('subject', subject)
    .eq('name', name)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await raw
    .from('tags')
    .insert({ subject, name })
    .select('id')
    .single()

  if (error) return null
  return inserted?.id ?? null
}

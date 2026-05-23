import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseDocx } from '@/lib/parsers/docx-parser'
import { parsePdf } from '@/lib/parsers/pdf-parser'
import { createServiceClient, updateFileImportStatus, uploadQuestionImage } from '@/lib/import-files'
import { classifyQuestion, subjectFromModule } from '@/lib/categorization/classifier'
import type { Database } from '@/types/database'

type RawClient = any

const OptionSchema = z.object({
  label: z.string(),
  content: z.string(),
  is_correct: z.boolean(),
  order: z.number(),
})

export const ReviewQuestionSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['multiple_choice', 'short_answer']),
  content_hash: z.string(),
  image_url: z.string().nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  teacher_explanation: z.string().nullable().optional(),
  module: z.string().optional(),
  category: z.string().nullable().optional(),
  classification_confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  tag_id: z.string().min(1).nullable().optional(),
  options: z.array(OptionSchema).optional(),
  accepted_answers: z.array(z.string()).optional(),
  skip: z.boolean().optional(),
  replace: z.boolean().optional(),
  is_duplicate: z.boolean().optional(),
})

export const BulkSaveQuestionsSchema = z.object({
  questions: z.array(ReviewQuestionSchema),
  upload_import_id: z.string().uuid().optional(),
})

export type ReviewQuestion = z.infer<typeof ReviewQuestionSchema>

type FileImportRow = {
  id: string
  uploaded_by: string
  storage_bucket: string
  storage_path: string
  file_type: 'docx' | 'pdf'
  status: string
}

type FileImportResultRow = {
  reviewed_payload: unknown
  parsed_payload?: unknown
}

export async function runParseQuestionImportJob({
  importId,
  skipDedup,
}: {
  importId: string
  skipDedup: boolean
}) {
  const raw = createServiceClient() as RawClient

  try {
    const { data: fileImport, error: importError } = await (raw.from('file_imports') as any)
      .select('id, uploaded_by, storage_bucket, storage_path, file_type, status')
      .eq('id', importId)
      .single()

    if (importError || !fileImport) {
      throw new Error(importError?.message ?? 'Không tìm thấy file import.')
    }

    const row = fileImport as FileImportRow
    const { data: object, error: downloadError } = await raw.storage
      .from(row.storage_bucket)
      .download(row.storage_path)

    if (downloadError || !object) {
      throw new Error(downloadError?.message ?? 'Không thể tải file import từ Storage.')
    }

    await updateFileImportStatus({
      raw,
      importId,
      status: 'processing',
      errorMessage: null,
    })

    const arrayBuffer = await object.arrayBuffer()
    const result = row.file_type === 'pdf'
      ? await parsePdf(arrayBuffer)
      : await parseDocx(arrayBuffer)

    if (!result.success) {
      await upsertFileImportResult(raw, {
        importId,
        parseErrors: result.errors,
      })
      await updateFileImportStatus({
        raw,
        importId,
        status: 'failed',
        failureCount: result.errors.length,
        errorMessage: 'File không đúng định dạng.',
      })
      return { status: 'failed' as const, total: 0, errors: result.errors }
    }

    if (result.questions.length === 0) {
      await updateFileImportStatus({
        raw,
        importId,
        status: 'failed',
        errorMessage: 'Không tìm thấy câu hỏi nào trong file.',
      })
      return { status: 'failed' as const, total: 0, errors: [] }
    }

    let existingHashes = new Set<string>()
    if (!skipDedup) {
      const hashes = result.questions.map((q) => q.contentHash)
      const { data: existing } = await raw
        .from('questions')
        .select('content_hash')
        .in('content_hash', hashes) as { data: { content_hash: string }[] | null }
      existingHashes = new Set((existing ?? []).map((r) => r.content_hash))
    }

    const { data: tags } = await raw
      .from('tags')
      .select('id, subject, name') as {
        data: { id: string; subject: 'reading_writing' | 'math'; name: string }[] | null
      }
    const tagLookup = buildTagLookup(tags ?? [])

    const saveDisabledReason = getSaveDisabledReason(result.questions)

    // Upload question images to Supabase Storage and collect public URLs.
    // We do this before building the annotated array so every question gets
    // a plain URL in image_url — never a raw base64 blob.
    const imageUrlByHash = new Map<string, string | null>()
    for (const q of result.questions) {
      if (q.imageBase64) {
        try {
          const publicUrl = await uploadQuestionImage(raw, {
            importId,
            contentHash: q.contentHash,
            base64DataUrl: q.imageBase64,
          })
          imageUrlByHash.set(q.contentHash, publicUrl)
        } catch {
          // Non-fatal: log and continue without the image rather than failing
          // the entire import job.
          console.error(`[question-import] Failed to upload image for question ${q.contentHash}`)
          imageUrlByHash.set(q.contentHash, null)
        }
      } else {
        imageUrlByHash.set(q.contentHash, null)
      }
    }

    const annotated = result.questions.map((q) => {
      // Use parsed category (from skill: bullet) or auto-classify
      let resolvedCategory = q.category ?? null
      let classificationConfidence: 'high' | 'medium' | 'low' | null = null

      if (!resolvedCategory) {
        const subject = subjectFromModule(q.module)
        const classified = classifyQuestion(q.content, subject)
        if (classified.category !== 'Uncategorized') {
          resolvedCategory = classified.category
          classificationConfidence = classified.confidence
        }
      } else {
        classificationConfidence = 'high' // came from the DOCX skill: bullet
      }

      return {
        content: q.content,
        type: q.type,
        content_hash: q.contentHash,
        image_url: imageUrlByHash.get(q.contentHash) ?? null, // always a URL, never base64
        module: q.module,
        difficulty: q.difficulty ?? null,
        teacher_explanation: q.teacherExplanation ?? null,
        category: resolvedCategory,
        classification_confidence: classificationConfidence,
        tag_id: resolvedCategory ? resolveTagId(tagLookup, resolvedCategory, q.module) : null,
        options: q.options.map((o, i) => ({
          label: o.label,
          content: o.content,
          is_correct: o.isCorrect,
          order: i + 1,
        })),
        accepted_answers: q.acceptedAnswers,
        is_duplicate: existingHashes.has(q.contentHash),
      }
    })

    await upsertFileImportResult(raw, {
      importId,
      parsedPayload: {
        questions: annotated,
        total: annotated.length,
        duplicates: annotated.filter((q) => q.is_duplicate).length,
        save_disabled_reason: saveDisabledReason,
      },
      parseErrors: null,
    })
    await updateFileImportStatus({
      raw,
      importId,
      status: 'parsed',
      totalRecords: annotated.length,
      failureCount: 0,
      errorMessage: null,
    })

    return { status: 'parsed' as const, total: annotated.length, errors: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    await updateFileImportStatus({
      raw,
      importId,
      status: 'failed',
      errorMessage: `Lỗi phân tích file: ${message}`,
    })
    throw err
  }
}

export async function storeReviewedQuestionPayload({
  importId,
  questions,
}: {
  importId: string
  questions: ReviewQuestion[]
}) {
  const validationError = validateQuestionsAreSaveable(questions)
  if (validationError) {
    throw new Error(validationError)
  }

  const raw = createServiceClient() as RawClient
  const { data: resultRow } = await (raw.from('file_import_results') as any)
    .select('parsed_payload')
    .eq('import_id', importId)
    .maybeSingle()

  const parsedPayload = (resultRow as FileImportResultRow | null)?.parsed_payload as { save_disabled_reason?: string } | null
  if (parsedPayload?.save_disabled_reason) {
    throw new Error(parsedPayload.save_disabled_reason)
  }

  await upsertFileImportResult(raw, {
    importId,
    reviewedPayload: { questions },
  })
}

export async function runSaveQuestionImportJob({
  importId,
  requestedBy,
}: {
  importId: string
  requestedBy: string
}) {
  const raw = rawClient()

  const { data: resultRow, error: resultError } = await (raw.from('file_import_results') as any)
    .select('reviewed_payload')
    .eq('import_id', importId)
    .single()

  if (resultError || !resultRow) {
    throw new Error(resultError?.message ?? 'Không tìm thấy dữ liệu review để lưu.')
  }

  const payload = z.object({ questions: z.array(ReviewQuestionSchema) }).parse(
    (resultRow as FileImportResultRow).reviewed_payload
  )

  const questions = payload.questions.filter((q) => !q.skip)
  if (questions.length === 0) {
    await updateFileImportStatus({
      raw,
      importId,
      status: payload.questions.length > 0 ? 'partial_success' : 'success',
      totalRecords: payload.questions.length,
      successCount: 0,
      failureCount: payload.questions.length,
      errorMessage: null,
    })
    return { saved: 0, savedIds: [] as string[], errors: [] as { content: string; error: string }[] }
  }

  await updateFileImportStatus({ raw, importId, status: 'processing', errorMessage: null })

  let saved = 0
  const savedIds: string[] = []
  const saveErrors: { content: string; error: string }[] = []

  for (const q of questions) {
    try {
      if (q.replace && q.is_duplicate) {
        await raw.from('questions').delete().eq('content_hash', q.content_hash)
      }

      const { data: newQ, error: qError } = await raw
        .from('questions')
        .insert({
          created_by: requestedBy,
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

      if (q.type === 'short_answer' && q.accepted_answers && q.accepted_answers.length > 0) {
        await raw.from('question_accepted_answers').insert(
          q.accepted_answers.map((a) => ({
            question_id: questionId,
            answer_text: a,
          }))
        )
      }

      const tagId = q.tag_id ?? (q.category ? await ensureCategoryTag(raw, q.category, q.module) : null)

      if (tagId) {
        await raw.from('question_tags').insert({
          question_id: questionId,
          tag_id: tagId,
          confidence: q.classification_confidence ?? 'high',
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

  const failureCount = saveErrors.length + payload.questions.filter((q) => q.skip).length
  await upsertFileImportResult(raw, {
    importId,
    saveErrors,
    saveResult: { saved, savedIds, errors: saveErrors },
  })
  await updateFileImportStatus({
    raw,
    importId,
    status: failureCount > 0 ? 'partial_success' : 'success',
    totalRecords: payload.questions.length,
    successCount: saved,
    failureCount,
    errorMessage: saveErrors.length > 0 ? `${saveErrors.length} câu hỏi không thể lưu.` : null,
  })

  return { saved, savedIds, errors: saveErrors }
}

function validateQuestionsAreSaveable(questions: ReviewQuestion[]) {
  const toSave = questions.filter((q) => !q.skip)
  for (let idx = 0; idx < toSave.length; idx++) {
    const q = toSave[idx]
    const humanIndex = idx + 1
    if (q.type === 'multiple_choice') {
      const options = q.options ?? []
      if (options.length !== 4 || options.some((option) => !option.content.trim())) {
        return `Câu hỏi ${humanIndex} chưa đủ 4 đáp án để lưu.`
      }
      const correctCount = options.filter((option) => option.is_correct).length
      if (correctCount !== 1) {
        return `Câu hỏi ${humanIndex} cần chọn đúng 1 đáp án đúng trước khi lưu.`
      }
    }

    if (q.type === 'short_answer') {
      const answers = q.accepted_answers ?? []
      if (!answers.some((answer) => answer.trim())) {
        return `Câu hỏi ${humanIndex} cần nhập đáp án đúng trước khi lưu.`
      }
    }
  }

  return null
}

function getSaveDisabledReason(questions: Array<{
  type: string
  options: Array<{ isCorrect: boolean }>
  acceptedAnswers: string[]
}>) {
  const hasMissingAnswerKey = questions.some((q) => {
    if (q.type === 'multiple_choice') return q.options.every((option) => !option.isCorrect)
    if (q.type === 'short_answer') return q.acceptedAnswers.length === 0
    return false
  })

  return hasMissingAnswerKey
    ? 'PDF này thiếu Answer Key nên chỉ có thể xem trước/chỉnh sửa, không thể lưu trực tiếp vào ngân hàng câu hỏi. Vui lòng thêm Answer Key vào PDF hoặc dùng DOCX-TEMPLATE.md.'
    : null
}

async function upsertFileImportResult(
  raw: RawClient,
  {
    importId,
    parsedPayload,
    reviewedPayload,
    parseErrors,
  saveErrors,
  saveResult,
  }: {
    importId: string
    parsedPayload?: unknown
    reviewedPayload?: unknown
    parseErrors?: unknown
    saveErrors?: unknown
    saveResult?: unknown
  }
) {
  const patch = {
    import_id: importId,
    ...(parsedPayload !== undefined ? { parsed_payload: parsedPayload } : {}),
    ...(reviewedPayload !== undefined ? { reviewed_payload: reviewedPayload } : {}),
    ...(parseErrors !== undefined ? { parse_errors: parseErrors } : {}),
    ...(saveErrors !== undefined ? { save_errors: saveErrors } : {}),
    ...(saveResult !== undefined ? { save_result: saveResult } : {}),
    updated_at: new Date().toISOString(),
  }

  const { error } = await (raw.from('file_import_results') as any).upsert(patch, { onConflict: 'import_id' })
  if (error) throw new Error(`Không thể cập nhật kết quả import: ${error.message}`)
}

function rawClient(): RawClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function ensureCategoryTag(
  raw: RawClient,
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

function buildTagLookup(tags: { id: string; subject: 'reading_writing' | 'math'; name: string }[]) {
  const lookup = new Map<string, string>()
  for (const tag of tags) {
    lookup.set(`${tag.subject}:${normalizeTagName(tag.name)}`, tag.id)
  }
  return lookup
}

function resolveTagId(tagLookup: Map<string, string>, category: string, module: string): string | null {
  const subject = /math/i.test(module) ? 'math' : 'reading_writing'
  const normalized = normalizeTagName(category)
  return tagLookup.get(`${subject}:${normalized}`) ?? null
}

function normalizeTagName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

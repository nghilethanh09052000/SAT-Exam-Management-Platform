import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { QuestionType, QuestionDifficulty } from '@/types/database'

const CreateQuestionSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer']),
  content: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  content_hash: z.string(),
  teacher_explanation: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        content: z.string(),
        is_correct: z.boolean(),
        order: z.number().int(),
      })
    )
    .optional(),
  accepted_answers: z.array(z.string()).optional(),
  tag_ids: z.array(z.string().min(1)).optional(),
})

const PAGE_SIZE = 20

type TagRow = { id: string; name: string; subject: string }

type RawRow = {
  id: string
  type: string
  content_preview: string | null
  difficulty: string | null
  created_at: string
  question_tags?: { tags: TagRow | null }[]
}

type RpcRow = {
  id: string
  type: string
  content_preview: string | null
  difficulty: string | null
  created_at: string
  tags: TagRow[] | null
}

function normaliseRow(q: RawRow | RpcRow, isRpc: boolean) {
  const tags: TagRow[] = isRpc
    ? ((q as RpcRow).tags ?? [])
    : ((q as RawRow).question_tags ?? [])
        .map((qt) => qt.tags)
        .filter((t): t is TagRow => Boolean(t))
  return {
    id:              q.id,
    type:            q.type,
    content_preview: q.content_preview ?? '',
    difficulty:      q.difficulty,
    created_at:      q.created_at,
    tags,
  }
}

export const GET = withTeacher(async (req, { db }) => {
  const { searchParams } = new URL(req.url)

  const type           = searchParams.get('type')
  const difficulty     = searchParams.get('difficulty')
  const tagId          = searchParams.get('tag_id')
  const search         = searchParams.get('search')
  const afterCreatedAt = searchParams.get('after_created_at')
  const afterId        = searchParams.get('after_id')

  // ── Search path: compound RPC (content_preview + tag names) ─────────────────
  // When a keyword is supplied we want ALL matching results ordered by relevance,
  // not a date-ordered first page of 20. The DB function skips the keyset cursor
  // when p_search is set (see migration 20260526202045), so we just pass a large
  // limit and omit the cursor — the client hides pagination in search mode.
  if (search && search.trim().length > 0) {
    const { data, error } = await (db as any).rpc('search_questions', {
      p_search:           search.trim(),
      p_type:             type       ?? null,
      p_difficulty:       difficulty ?? null,
      p_tag_id:           tagId      ?? null,
      p_after_created_at: null,   // cursor unused during keyword search
      p_after_id:         null,
      p_limit:            1000,   // return all matches; UI hides pagination
    })
    if (error) return NextResponse.json({ data: null, has_next: false, error: error.message }, { status: 400 })

    const rows = (data ?? []) as RpcRow[]
    const page = rows.map((q) => normaliseRow(q, true))
    // has_next is always false in search mode — all matches are returned at once
    return NextResponse.json({ data: page, has_next: false, error: null })
  }

  // ── No-search path: query builder ───────────────────────────────────────────
  let query = db
    .from('questions')
    .select(
      tagId
        ? 'id, type, content_preview, difficulty, created_at, question_tags!inner(tags(id, name, subject))'
        : 'id, type, content_preview, difficulty, created_at, question_tags(tags(id, name, subject))'
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (type)       query = query.eq('type', type as QuestionType)
  if (difficulty) query = query.eq('difficulty', difficulty as QuestionDifficulty)
  if (tagId)      query = (query as any).eq('question_tags.tag_id', tagId)

  if (afterCreatedAt && afterId) {
    query = query.or(
      `created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, has_next: false, error: error.message }, { status: 400 })

  const rows    = (data ?? []) as unknown as RawRow[]
  const hasNext = rows.length > PAGE_SIZE
  const page    = rows.slice(0, PAGE_SIZE).map((q) => normaliseRow(q, false))

  return NextResponse.json({ data: page, has_next: hasNext, error: null })
})

export const POST = withTeacher(async (req, { user, db }) => {
  const body = await req.json()
  const parsed = CreateQuestionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { options, accepted_answers, tag_ids, ...questionData } = parsed.data

  const { data: question, error: qError } = await db
    .from('questions')
    .insert({ ...questionData, created_by: user.id })
    .select('id, content')
    .single()

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })

  if (options && options.length > 0) {
    const { error: oError } = await db
      .from('question_options')
      .insert(options.map((o) => ({ ...o, question_id: question.id })))
    if (oError) return NextResponse.json({ data: null, error: oError.message }, { status: 400 })
  }

  if (accepted_answers && accepted_answers.length > 0) {
    const { error: aError } = await db
      .from('question_accepted_answers')
      .insert(accepted_answers.map((a) => ({ question_id: question.id, answer_text: a })))
    if (aError) return NextResponse.json({ data: null, error: aError.message }, { status: 400 })
  }

  if (tag_ids && tag_ids.length > 0) {
    const { error: tError } = await db
      .from('question_tags')
      .insert(tag_ids.map((tid) => ({ question_id: question.id, tag_id: tid })))
    if (tError) return NextResponse.json({ data: null, error: tError.message }, { status: 400 })
  }

  revalidatePath('/teacher/questions')
  revalidateTag('questions')
  return NextResponse.json({ data: question, error: null })
})

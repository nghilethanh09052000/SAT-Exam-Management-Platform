import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'
import { revalidatePath, revalidateTag } from 'next/cache'

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

type RawRow = {
  id: string
  type: string
  content_preview: string | null
  difficulty: string | null
  created_at: string
  question_tags?: { tags: { id: string; name: string; subject: string } | null }[]
}

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)

  const type           = searchParams.get('type')
  const difficulty     = searchParams.get('difficulty')
  const tagId          = searchParams.get('tag_id')
  const search         = searchParams.get('search')
  const afterCreatedAt = searchParams.get('after_created_at')
  const afterId        = searchParams.get('after_id')

  // content_preview instead of content — 58× smaller per row (DB generated column).
  // Tag filter: !inner join replaces the old two-query approach.
  let query = supabase
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

  if (type)       query = query.eq('type', type)
  if (difficulty) query = query.eq('difficulty', difficulty)
  if (tagId)      query = (query as any).eq('question_tags.tag_id', tagId)

  // Search: use the GIN full-text index (idx_questions_fts).
  // plainto_tsquery handles multi-word input naturally ("Elizabeth Gaskell" → AND logic).
  // Short queries (< 3 chars) skip FTS — too many irrelevant matches.
  if (search && search.trim().length >= 3) {
    query = (query as any).textSearch('content', search.trim(), { type: 'plain', config: 'english' })
  } else if (search && search.trim().length > 0) {
    // Short prefix — fall back to ILIKE for single-letter partial matches
    query = query.ilike('content', `%${search.trim()}%`)
  }

  // Keyset cursor — no OFFSET, just a WHERE clause on (created_at, id)
  if (afterCreatedAt && afterId) {
    query = query.or(
      `created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, has_next: false, error: error.message }, { status: 400 })

  const rows    = (data ?? []) as unknown as RawRow[]
  const hasNext = rows.length > PAGE_SIZE
  const page    = rows.slice(0, PAGE_SIZE).map((q) => ({
    id:              q.id,
    type:            q.type,
    content_preview: q.content_preview ?? '',
    difficulty:      q.difficulty,
    created_at:      q.created_at,
    tags: (q.question_tags ?? [])
      .map((qt) => qt.tags)
      .filter((t): t is { id: string; name: string; subject: string } => Boolean(t)),
  }))

  return NextResponse.json({ data: page, has_next: hasNext, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = CreateQuestionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { options, accepted_answers, tag_ids, ...questionData } = parsed.data

  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

  // Insert question
  const { data: question, error: qError } = await raw
    .from('questions')
    .insert({ ...questionData, created_by: user.id })
    .select('id, content')
    .single()

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })

  // Insert options
  if (options && options.length > 0) {
    const { error: oError } = await raw
      .from('question_options')
      .insert(options.map((o) => ({ ...o, question_id: question.id })))
    if (oError) return NextResponse.json({ data: null, error: oError.message }, { status: 400 })
  }

  // Insert accepted answers
  if (accepted_answers && accepted_answers.length > 0) {
    const { error: aError } = await raw
      .from('question_accepted_answers')
      .insert(accepted_answers.map((a) => ({ question_id: question.id, answer_text: a })))
    if (aError) return NextResponse.json({ data: null, error: aError.message }, { status: 400 })
  }

  // Insert tags
  if (tag_ids && tag_ids.length > 0) {
    const { error: tError } = await raw
      .from('question_tags')
      .insert(tag_ids.map((tid) => ({ question_id: question.id, tag_id: tid })))
    if (tError) return NextResponse.json({ data: null, error: tError.message }, { status: 400 })
  }

  revalidatePath('/teacher/questions')
  revalidateTag('questions')   // bust the getCachedStats() 60-s cache
  return NextResponse.json({ data: question, error: null })
}

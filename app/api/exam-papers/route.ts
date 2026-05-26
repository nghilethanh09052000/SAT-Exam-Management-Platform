import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { withTeacher, withAnyAuth } from '@/lib/with-auth'

const CreateExamPaperSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
  is_public: z.boolean().optional(),
})

const PAGE_SIZE = 50

export const GET = withAnyAuth(async (req, { db }) => {
  const { searchParams } = new URL(req.url)
  const afterCreatedAt = searchParams.get('after_created_at')
  const afterId        = searchParams.get('after_id')

  let query = db
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_by, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (afterCreatedAt && afterId) {
    query = query.or(
      `created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  const rows    = data ?? []
  const hasNext = rows.length > PAGE_SIZE
  return NextResponse.json({ data: rows.slice(0, PAGE_SIZE), has_next: hasNext, error: null })
})

export const POST = withTeacher(async (req, { user, db }) => {
  const body = await req.json()
  const parsed = CreateExamPaperSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data, error } = await db
    .from('exam_papers')
    .insert({ ...parsed.data, created_by: user.id })
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/exam-papers')
  return NextResponse.json({ data, error: null })
})

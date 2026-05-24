import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedProfile, isTeacherOrAdmin } from '@/lib/authz'

const CreateExamPaperSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
  is_public: z.boolean().optional(),
})

const PAGE_SIZE = 50

// GET /api/exam-papers — paginated list of active exam papers (keyset cursor)
// Params: after_created_at, after_id (both required for next-page cursor)
export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const afterCreatedAt = searchParams.get('after_created_at')
  const afterId        = searchParams.get('after_id')

  let query = supabase
    .from('exam_papers')
    .select('id, title, source, year, description, is_public, created_by, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(PAGE_SIZE + 1)

  // Keyset cursor — no OFFSET, stable under concurrent inserts
  if (afterCreatedAt && afterId) {
    query = query.or(
      `created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  const rows    = data ?? []
  const hasNext = rows.length > PAGE_SIZE
  const page    = rows.slice(0, PAGE_SIZE)

  return NextResponse.json({ data: page, has_next: hasNext, error: null })
}

// POST /api/exam-papers — create a new exam paper
export async function POST(req: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  if (!isTeacherOrAdmin(profile)) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateExamPaperSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await raw
    .from('exam_papers')
    .insert({ ...parsed.data, created_by: user.id })
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  revalidatePath('/teacher/exam-papers')
  return NextResponse.json({ data, error: null })
}

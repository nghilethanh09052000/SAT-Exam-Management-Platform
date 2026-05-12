import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const UpdateExamPaperSchema = z.object({
  title: z.string().min(1).optional(),
  source: z.string().optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
})

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// GET /api/exam-papers/[id] — fetch one exam paper with its questions
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const { data: paper, error: pError } = await supabase
    .from('exam_papers')
    .select('id, title, source, year, description, created_by, created_at, updated_at')
    .eq('id', params.id)
    .is('archived_at', null)
    .single()

  if (pError || !paper) {
    return NextResponse.json({ data: null, error: pError?.message ?? 'Not found' }, { status: 404 })
  }

  const { data: questions, error: qError } = await supabase
    .from('exam_paper_questions')
    .select(`
      id, order_index, module_name, score_weight,
      question:questions(id, type, content, difficulty)
    `)
    .eq('exam_paper_id', params.id)
    .order('module_name', { ascending: true })
    .order('order_index', { ascending: true })

  if (qError) return NextResponse.json({ data: null, error: qError.message }, { status: 400 })

  return NextResponse.json({ data: { ...paper, questions: questions ?? [] }, error: null })
}

// PATCH /api/exam-papers/[id] — update metadata
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateExamPaperSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = serviceRole()
  const { data, error } = await raw
    .from('exam_papers')
    .update(parsed.data)
    .eq('id', params.id)
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/exam-papers/[id] — soft-archive
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const raw = serviceRole()
  const { error } = await raw
    .from('exam_papers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true }, error: null })
}

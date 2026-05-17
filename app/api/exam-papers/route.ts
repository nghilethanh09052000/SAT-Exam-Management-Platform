import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const CreateExamPaperSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
})

// GET /api/exam-papers — list all active exam papers
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('exam_papers')
    .select('id, title, source, year, description, created_by, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

// POST /api/exam-papers — create a new exam paper
export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  // Validate role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['teacher', 'admin'].includes((profile as { role: string }).role)) {
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

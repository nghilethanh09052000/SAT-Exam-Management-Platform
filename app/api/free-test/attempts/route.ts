import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateAttemptSchema = z.object({
  exam_paper_id: z.string().uuid(),
})

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const parsed = CreateAttemptSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = serviceRole()
  const { data: paper } = await raw
    .from('exam_papers')
    .select('id')
    .eq('id', parsed.data.exam_paper_id)
    .eq('is_public', true)
    .is('archived_at', null)
    .single()

  if (!paper) return NextResponse.json({ data: null, error: 'Public test not found' }, { status: 404 })

  const { data: existing } = await raw
    .from('public_exam_attempts')
    .select('id, status, started_at, current_question_id, current_module')
    .eq('exam_paper_id', parsed.data.exam_paper_id)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return NextResponse.json({ data: existing, error: null })

  const { count } = await raw
    .from('public_exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_paper_id', parsed.data.exam_paper_id)
    .eq('student_id', user.id)

  const { data, error } = await raw
    .from('public_exam_attempts')
    .insert({
      exam_paper_id: parsed.data.exam_paper_id,
      student_id: user.id,
      attempt_number: (count ?? 0) + 1,
    })
    .select('id, status, started_at, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

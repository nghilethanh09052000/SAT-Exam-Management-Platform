import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const CreateInstanceSchema = z.object({
  assignment_id: z.string().min(1),
  class_id: z.string().min(1),
  week_id: z.string().min(1),
  deadline: z.string(),
  is_timed: z.boolean().optional(),
  time_limit_seconds: z.number().nullable().optional(),
  show_results: z.enum(['immediately', 'after_deadline']).optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  max_retakes: z.number().int().optional(),
  alert_enabled: z.boolean().optional(),
  published_at: z.string().nullable().optional(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('class_id')
  const weekId = searchParams.get('week_id')

  let query = supabase
    .from('assignment_instances')
    .select(
      'id, assignment_id, class_id, week_id, deadline, is_timed, time_limit_seconds, show_results, shuffle_questions, shuffle_options, max_retakes, alert_enabled, published_at, created_at'
    )
    .order('deadline', { ascending: true })

  if (classId) query = query.eq('class_id', classId)
  if (weekId) query = query.eq('week_id', weekId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = CreateInstanceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await raw
    .from('assignment_instances')
    .insert(parsed.data)
    .select('id, deadline')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

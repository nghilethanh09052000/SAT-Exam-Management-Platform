import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const CreateSubmissionSchema = z.object({
  instance_id: z.string().uuid(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const instanceId = searchParams.get('instance_id')
  const studentId = searchParams.get('student_id')

  let query = supabase
    .from('submissions')
    .select(
      'id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds'
    )
    .order('started_at', { ascending: false })

  if (instanceId) query = query.eq('instance_id', instanceId)
  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = CreateSubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  // Get attempt number
  const countResult = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('instance_id', parsed.data.instance_id)
    .eq('student_id', user.id)
  const count = countResult.count

  const raw = createRawClient()
  const { data, error } = await raw
    .from('submissions')
    .insert({
      instance_id: parsed.data.instance_id,
      student_id: user.id,
      attempt_number: (count ?? 0) + 1,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('id, instance_id, attempt_number, status, started_at')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

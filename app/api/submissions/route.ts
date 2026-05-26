import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const CreateSubmissionSchema = z.object({
  instance_id: z.string().min(1),
})

function submissionCreateStatus(message: string) {
  if (message.includes('deadline') || message.includes('Retake limit')) return 409
  if (message.includes('not found')) return 404
  if (message.includes('Unauthorized')) return 401
  return 400
}

export const GET = withAnyAuth(async (req) => {
  const { searchParams } = new URL(req.url)
  const instanceId = searchParams.get('instance_id')
  const studentId = searchParams.get('student_id')

  // Use the session-carrying client so RLS controls visibility per role
  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('submissions')
    .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
    .order('started_at', { ascending: false })
    .limit(200)

  if (instanceId) query = query.eq('instance_id', instanceId)
  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const POST = withAnyAuth(async (req) => {
  const body = await req.json()
  const parsed = CreateSubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  // Use the session-carrying client so the RPC can call auth.uid() internally
  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('create_submission_attempt', { p_instance_id: parsed.data.instance_id })
    .single()

  if (error) {
    return NextResponse.json(
      { data: null, error: error.message },
      { status: submissionCreateStatus(error.message) }
    )
  }
  return NextResponse.json({ data, error: null })
})

/**
 * POST /api/submissions/[id]/submit
 *
 * Thin submit route — validates, atomically guards against double-submit,
 * then enqueues the grading job. Returns 202 immediately so the student
 * never waits for N+1 DB queries to finish.
 *
 * Double-submit protection: the UPDATE only succeeds when
 * status = 'in_progress'. The second request finds status = 'grading'
 * and gets 0 rows back → 409. Only one grading job is ever enqueued.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendQueueMessage } from '@/lib/queues/client'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { GradeSubmissionPayloadSchema } from '@/lib/queues/payloads'
import { runGradeSubmissionJob } from '@/lib/jobs/grade-submission'

const AnswerSchema = z.object({
  question_id:          z.string().min(1),
  selected_option_id:   z.string().min(1).nullable().optional(),
  answer_text:          z.string().nullable().optional(),
  time_spent_seconds:   z.number().int().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
})

const SubmitSchema = z.object({
  answers:            z.array(AnswerSchema),
  time_spent_seconds: z.number().int().optional(),
})

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const raw = rawClient()

  // Atomic guard: flip status in_progress → grading in a single UPDATE.
  // If another request already flipped it (double-submit), this returns
  // 0 rows and we return 409 — only one grading job ever gets enqueued.
  const { data: updated } = await raw
    .from('submissions')
    .update({ status: 'grading', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('student_id', user.id)
    .eq('status', 'in_progress')   // ← only succeeds when still in_progress
    .select('id')
    .single()

  if (!updated) {
    return NextResponse.json(
      { data: null, error: 'Submission already submitted or not found' },
      { status: 409 }
    )
  }

  const payload = GradeSubmissionPayloadSchema.parse({
    job:                'grade-submission',
    submissionId:       params.id,
    studentId:          user.id,
    answers:            parsed.data.answers,
    time_spent_seconds: parsed.data.time_spent_seconds,
  })

  // In production, enqueue the grading job and return 202 immediately.
  // In local development, Vercel Queues require `vercel env pull` + OIDC token,
  // which isn't available without the Vercel CLI running. Fall back to running
  // the grading job synchronously so local testing works end-to-end.
  try {
    await sendQueueMessage(
      QUEUE_TOPICS.gradeSubmission,
      payload,
      { idempotencyKey: `grade-submission:${params.id}` }
    )
  } catch {
    // Queue unavailable (local dev or misconfiguration) — run synchronously.
    // This is intentionally fire-and-forget in production via the queue.
    if (process.env.NODE_ENV !== 'production') {
      await runGradeSubmissionJob(payload)
    } else {
      // Re-throw in production so the 500 surfaces and can be alerted on
      throw new Error(`Queue enqueue failed for submission ${params.id}`)
    }
  }

  // Return immediately — student's UI polls for status change
  return NextResponse.json(
    { data: { status: 'grading' }, error: null },
    { status: 202 }
  )
}

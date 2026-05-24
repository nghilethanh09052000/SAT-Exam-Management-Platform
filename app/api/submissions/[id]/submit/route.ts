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

  // ── Choose sync vs async based on deployment environment ─────────────────
  //
  // VERCEL_ENV is set by the Vercel platform:
  //   'production'  → actually deployed, queue worker is reachable by cloud
  //   'preview'     → preview deployment, queue reachable
  //   'development' → `vercel dev` — queue message goes to cloud, cloud tries
  //                   to call back localhost which is unreachable → grading hangs
  //   undefined     → plain `next dev` — Vercel Queue SDK throws (no OIDC)
  //
  // In production and preview, use the queue (async, 202).
  // In everything else (vercel dev, next dev), run synchronously and return
  // 200 so the client navigates to /results immediately without any polling.
  const isDeployed = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'

  if (!isDeployed) {
    // Local / vercel dev: grade synchronously, return final status immediately.
    await runGradeSubmissionJob(payload)
    return NextResponse.json(
      { data: { status: 'submitted' }, error: null },
      { status: 200 }
    )
  }

  // ── Production / Preview: enqueue async, return 202 immediately ───────────
  // The grading worker picks this up and calls runGradeSubmissionJob.
  // The client polls GET /api/submissions/[id] until status → 'submitted'.
  await sendQueueMessage(
    QUEUE_TOPICS.gradeSubmission,
    payload,
    { idempotencyKey: `grade-submission:${params.id}` }
  )

  return NextResponse.json(
    { data: { status: 'grading' }, error: null },
    { status: 202 }
  )
}

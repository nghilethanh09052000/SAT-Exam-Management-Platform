/**
 * POST /api/queues/grade-submission
 *
 * Vercel Queue worker — receives one grading job per student submission.
 * Each student's submission dispatches its own independent message, so
 * 50 simultaneous submits → 50 independent worker invocations, never
 * blocking each other.
 *
 * Pattern mirrors /api/queues/question-import.
 */

import { handleQueueCallback } from '@/lib/queues/client'
import { GradeSubmissionPayloadSchema } from '@/lib/queues/payloads'
import { runGradeSubmissionJob } from '@/lib/jobs/grade-submission'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60  // grading 44 questions takes well under 10s

const handleGradeSubmission = handleQueueCallback(async (message) => {
  const payload = GradeSubmissionPayloadSchema.parse(message)
  await runGradeSubmissionJob(payload)
})

export async function POST(request: Request) {
  return handleGradeSubmission(request)
}

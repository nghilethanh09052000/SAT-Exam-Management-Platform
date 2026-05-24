/**
 * lib/jobs/grade-submission.ts
 *
 * Grading worker — runs inside the Vercel Queue worker function.
 * Replaces the N+1 query pattern (44 queries) with 4 queries total:
 *   1. Batch fetch all MCQ option correctness
 *   2. Batch fetch all short-answer accepted answers
 *   3. Upsert all graded answers in one statement
 *   4. Mark submission as submitted with final score
 *
 * Each student's submission gets its own independent worker instance —
 * no shared state, no lock contention between different students.
 */

import { createClient } from '@supabase/supabase-js'
import { calculateRawScore, isShortAnswerCorrect } from '@/lib/utils/score'
import type { GradeSubmissionPayload } from '@/lib/queues/payloads'

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function runGradeSubmissionJob(payload: GradeSubmissionPayload) {
  const { submissionId, answers, time_spent_seconds } = payload
  const raw = rawClient()

  // ── Collect all IDs upfront ───────────────────────────────────────────────
  const optionIds = answers
    .map((a) => a.selected_option_id)
    .filter((id): id is string => Boolean(id))

  const saQuestionIds = answers
    .filter((a) => a.answer_text && !a.selected_option_id)
    .map((a) => a.question_id)

  // ── Query 1 + 2: batch reads in parallel (replaces N+1) ──────────────────
  //
  //   SQL 1: SELECT id, is_correct FROM question_options WHERE id IN (...)
  //   SQL 2: SELECT question_id, answer_text FROM question_accepted_answers
  //          WHERE question_id IN (...)
  //
  const [optionsRes, acceptedRes] = await Promise.all([
    optionIds.length > 0
      ? raw
          .from('question_options')
          .select('id, is_correct')
          .in('id', optionIds)
      : Promise.resolve({ data: [] as { id: string; is_correct: boolean }[], error: null }),
    saQuestionIds.length > 0
      ? raw
          .from('question_accepted_answers')
          .select('question_id, answer_text')
          .in('question_id', saQuestionIds)
      : Promise.resolve({ data: [] as { question_id: string; answer_text: string }[], error: null }),
  ])

  if (optionsRes.error) throw new Error(`Failed to fetch options: ${optionsRes.error.message}`)
  if (acceptedRes.error) throw new Error(`Failed to fetch accepted answers: ${acceptedRes.error.message}`)

  // ── Build lookup maps — zero extra DB calls ───────────────────────────────
  const optionMap = new Map(
    (optionsRes.data ?? []).map((o) => [o.id, o.is_correct])
  )
  const acceptedMap = new Map<string, string[]>()
  for (const row of acceptedRes.data ?? []) {
    const list = acceptedMap.get(row.question_id) ?? []
    list.push(row.answer_text)
    acceptedMap.set(row.question_id, list)
  }

  // ── Grade every answer in memory — no DB calls ────────────────────────────
  const processedAnswers = answers.map((answer) => {
    let is_correct: boolean | null = null

    if (answer.selected_option_id) {
      // Multiple choice: O(1) map lookup
      is_correct = optionMap.get(answer.selected_option_id) ?? null
    } else if (answer.answer_text) {
      // Short answer: normalize + compare against accepted list
      const accepted = acceptedMap.get(answer.question_id) ?? []
      is_correct =
        accepted.length > 0
          ? isShortAnswerCorrect(answer.answer_text, accepted)
          : null
    }

    return {
      submission_id:        submissionId,
      question_id:          answer.question_id,
      selected_option_id:   answer.selected_option_id ?? null,
      answer_text:          answer.answer_text ?? null,
      is_correct,
      is_marked_for_review: answer.is_marked_for_review ?? false,
      time_spent_seconds:   answer.time_spent_seconds ?? null,
      answered_at:          new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    }
  })

  const rawScore = calculateRawScore(processedAnswers)

  // ── Query 3 + 4: batch write in parallel ──────────────────────────────────
  //
  //   SQL 3: INSERT INTO submission_answers (...) VALUES (...), (...), ...
  //          ON CONFLICT (submission_id, question_id) DO UPDATE SET ...
  //
  //   SQL 4: UPDATE submissions SET status='submitted', raw_score=...
  //          WHERE id = $submissionId
  //
  const [upsertRes, updateRes] = await Promise.all([
    raw
      .from('submission_answers')
      .upsert(processedAnswers, { onConflict: 'submission_id,question_id' }),
    raw
      .from('submissions')
      .update({
        status:          'submitted',
        raw_score:       rawScore,
        total_questions: answers.length,
        submitted_at:    new Date().toISOString(),
        time_spent_seconds: time_spent_seconds ?? null,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', submissionId),
  ])

  if (upsertRes.error) throw new Error(`Failed to save answers: ${upsertRes.error.message}`)
  if (updateRes.error) throw new Error(`Failed to update submission: ${updateRes.error.message}`)

  console.log(
    `[grade-submission] ✓ submissionId=${submissionId} score=${rawScore}/${answers.length}`
  )
}

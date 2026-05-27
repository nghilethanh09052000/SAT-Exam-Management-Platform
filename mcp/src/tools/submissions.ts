/**
 * mcp/src/tools/submissions.ts
 *
 * MCP tools for Submission analytics:
 *   - list_submissions        — filter by instance, student, or status
 *   - get_submission          — full detail with per-question answers
 *   - get_student_progress    — all submissions for one student across assignments
 *   - get_class_leaderboard   — ranked scores for a class on an assignment instance
 */

import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ListSubmissionsInput = z.object({
  instance_id: z.string().optional().describe('Filter by assignment instance UUID'),
  student_id:  z.string().optional().describe('Filter by student UUID'),
  status:      z.enum(['in_progress', 'grading', 'submitted', 'expired']).optional(),
  limit:       z.number().int().min(1).max(200).default(50),
})

export const GetSubmissionInput = z.object({
  id: z.string().describe('Submission UUID'),
  include_answers: z.boolean().default(false).describe('Include per-question answers'),
})

export const GetStudentProgressInput = z.object({
  student_id: z.string().describe('Student UUID'),
  limit:      z.number().int().min(1).max(100).default(20),
})

export const GetClassLeaderboardInput = z.object({
  instance_id: z.string().describe('Assignment instance UUID'),
  top_n:       z.number().int().min(1).max(50).default(10),
})

// ─── Tool implementations ────────────────────────────────────────────────────

export async function listSubmissions(db: AdminClient, input: z.infer<typeof ListSubmissionsInput>) {
  let query = db
    .from('submissions')
    .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
    .order('started_at', { ascending: false })
    .limit(input.limit)

  if (input.instance_id) query = query.eq('instance_id', input.instance_id)
  if (input.student_id)  query = query.eq('student_id',  input.student_id)
  if (input.status)      query = query.eq('status',      input.status)

  const { data, error } = await query
  if (error) return { error: error.message }

  // Enrich with percentage scores
  const rows = (data ?? []).map((s: any) => ({
    ...s,
    score_pct: s.raw_score !== null && s.total_questions > 0
      ? Math.round((s.raw_score / s.total_questions) * 100)
      : null,
  }))

  return { data: rows, error: null }
}

export async function getSubmission(db: AdminClient, input: z.infer<typeof GetSubmissionInput>) {
  const { data: submission, error: sErr } = await db
    .from('submissions')
    .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
    .eq('id', input.id)
    .single()

  if (sErr) return { error: sErr.message }

  if (!input.include_answers) return { data: submission, error: null }

  const { data: answers, error: aErr } = await db
    .from('submission_answers')
    .select(`
      id, question_id, selected_option_id, answer_text, is_correct, time_spent_seconds,
      questions(id, type, content_preview, subject, difficulty),
      question_options(id, label, content, is_correct)
    `)
    .eq('submission_id', input.id)

  if (aErr) return { error: aErr.message }

  return {
    data: {
      ...submission,
      score_pct: (submission as any).raw_score !== null && (submission as any).total_questions > 0
        ? Math.round(((submission as any).raw_score / (submission as any).total_questions) * 100)
        : null,
      answers: answers ?? [],
    },
    error: null,
  }
}

export async function getStudentProgress(db: AdminClient, input: z.infer<typeof GetStudentProgressInput>) {
  const { data: submissions, error } = await db
    .from('submissions')
    .select('id, instance_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
    .eq('student_id', input.student_id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(input.limit)

  if (error) return { error: error.message }

  const subs = (submissions ?? []) as any[]

  // Compute rolling average
  let runningTotal = 0
  const enriched = subs.map((s, i) => {
    const pct = s.raw_score !== null && s.total_questions > 0
      ? (s.raw_score / s.total_questions) * 100
      : null
    if (pct !== null) runningTotal += pct
    return {
      ...s,
      score_pct: pct !== null ? Math.round(pct) : null,
    }
  })

  const completed = enriched.filter(s => s.score_pct !== null)
  const summary = {
    total_submissions:  subs.length,
    avg_score_pct:      completed.length > 0 ? Math.round(runningTotal / completed.length) : null,
    best_score_pct:     completed.length > 0 ? Math.max(...completed.map(s => s.score_pct as number)) : null,
    total_time_seconds: subs.reduce((sum, s) => sum + (s.time_spent_seconds ?? 0), 0),
  }

  return { data: { summary, submissions: enriched }, error: null }
}

export async function getClassLeaderboard(db: AdminClient, input: z.infer<typeof GetClassLeaderboardInput>) {
  const { data: submissions, error } = await db
    .from('submissions')
    .select('id, student_id, attempt_number, raw_score, total_questions, submitted_at, time_spent_seconds, profiles(full_name, email)')
    .eq('instance_id', input.instance_id)
    .eq('status', 'submitted')
    .not('raw_score', 'is', null)
    .order('raw_score', { ascending: false })
    .order('time_spent_seconds', { ascending: true }) // tiebreak by speed
    .limit(input.top_n)

  if (error) return { error: error.message }

  const rows = (submissions ?? []).map((s: any, i) => ({
    rank:        i + 1,
    student:     s.profiles,
    raw_score:   s.raw_score,
    total:       s.total_questions,
    score_pct:   s.total_questions > 0 ? Math.round((s.raw_score / s.total_questions) * 100) : null,
    time_seconds: s.time_spent_seconds,
    submitted_at: s.submitted_at,
  }))

  return { data: rows, error: null }
}

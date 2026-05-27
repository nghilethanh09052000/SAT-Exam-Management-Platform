/**
 * mcp/src/tools/assignments.ts
 *
 * MCP tools for Assignment management:
 *   - list_assignments        — list assignments (optionally by teacher)
 *   - get_assignment          — full detail with questions
 *   - create_assignment       — create a new assignment
 *   - add_question_to_assignment — link a question to an assignment
 *   - get_submission_stats    — aggregate stats for an assignment instance
 */

import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ListAssignmentsInput = z.object({
  created_by: z.string().optional().describe('Filter by teacher UUID'),
  limit: z.number().int().min(1).max(100).default(20),
})

export const GetAssignmentInput = z.object({
  id: z.string().describe('Assignment UUID'),
})

export const CreateAssignmentInput = z.object({
  title: z.string().min(1).describe('Assignment title'),
  created_by: z.string().describe('Teacher UUID'),
})

export const AddQuestionInput = z.object({
  assignment_id: z.string().describe('Assignment UUID'),
  question_id:   z.string().describe('Question UUID'),
  order:         z.number().int().min(0).optional().describe('Display order (0-indexed)'),
  points:        z.number().optional().describe('Points awarded for correct answer'),
})

export const GetSubmissionStatsInput = z.object({
  assignment_id: z.string().describe('Assignment UUID — returns stats across all instances'),
  instance_id:   z.string().optional().describe('Narrow to a specific assignment instance'),
})

// ─── Tool implementations ────────────────────────────────────────────────────

export async function listAssignments(db: AdminClient, input: z.infer<typeof ListAssignmentsInput>) {
  let query = db
    .from('assignments')
    .select('id, title, created_by, archived_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(input.limit)

  if (input.created_by) query = query.eq('created_by', input.created_by)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}

export async function getAssignment(db: AdminClient, input: z.infer<typeof GetAssignmentInput>) {
  const { data: assignment, error: aErr } = await db
    .from('assignments')
    .select('id, title, created_by, archived_at, created_at')
    .eq('id', input.id)
    .single()

  if (aErr) return { error: aErr.message }

  const { data: questions, error: qErr } = await db
    .from('assignment_questions')
    .select(`
      id, order, points,
      questions(id, type, subject, content_preview, difficulty)
    `)
    .eq('assignment_id', input.id)
    .order('order', { ascending: true })

  if (qErr) return { error: qErr.message }

  return { data: { ...assignment, questions: questions ?? [] }, error: null }
}

export async function createAssignment(db: AdminClient, input: z.infer<typeof CreateAssignmentInput>) {
  const { data, error } = await db
    .from('assignments')
    .insert({ title: input.title, created_by: input.created_by })
    .select('id, title, created_at')
    .single()

  if (error) return { error: error.message }
  return { data, error: null }
}

export async function addQuestionToAssignment(db: AdminClient, input: z.infer<typeof AddQuestionInput>) {
  // Determine next order if not provided
  let order = input.order
  if (order === undefined) {
    const { count } = await db
      .from('assignment_questions')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', input.assignment_id)
    order = count ?? 0
  }

  const { data, error } = await db
    .from('assignment_questions')
    .insert({
      assignment_id: input.assignment_id,
      question_id:   input.question_id,
      order,
      ...(input.points !== undefined ? { points: input.points } : {}),
    })
    .select('id, assignment_id, question_id, order')
    .single()

  if (error) return { error: error.message }
  return { data, error: null }
}

export async function getSubmissionStats(db: AdminClient, input: z.infer<typeof GetSubmissionStatsInput>) {
  // Get all assignment instances for this assignment
  let instanceQuery = db
    .from('assignment_instances')
    .select('id, class_id, deadline, show_results')
    .eq('assignment_id', input.assignment_id)

  if (input.instance_id) instanceQuery = instanceQuery.eq('id', input.instance_id)

  const { data: instances, error: iErr } = await instanceQuery
  if (iErr) return { error: iErr.message }

  const instanceIds = (instances ?? []).map((i: any) => i.id)
  if (instanceIds.length === 0) return { data: { instances: [], submissions: [], stats: null }, error: null }

  // Get submissions for those instances
  const { data: submissions, error: sErr } = await db
    .from('submissions')
    .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, started_at, submitted_at, time_spent_seconds')
    .in('instance_id', instanceIds)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  if (sErr) return { error: sErr.message }

  const subs = (submissions ?? []) as any[]
  const completed = subs.filter(s => s.status === 'submitted' && s.raw_score !== null)

  const stats = completed.length === 0 ? null : {
    total_submissions: subs.length,
    completed_count:   completed.length,
    avg_score:         completed.reduce((sum: number, s: any) => sum + (s.raw_score / s.total_questions), 0) / completed.length,
    avg_raw_score:     completed.reduce((sum: number, s: any) => sum + s.raw_score, 0) / completed.length,
    max_score:         Math.max(...completed.map((s: any) => s.raw_score)),
    min_score:         Math.min(...completed.map((s: any) => s.raw_score)),
    avg_time_seconds:  completed.reduce((sum: number, s: any) => sum + (s.time_spent_seconds ?? 0), 0) / completed.length,
  }

  return { data: { instances, stats, submission_count: subs.length }, error: null }
}

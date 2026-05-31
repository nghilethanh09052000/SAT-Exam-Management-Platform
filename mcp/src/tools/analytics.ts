/**
 * mcp/src/tools/analytics.ts
 *
 * Higher-level analytics tools that aggregate data for the AI assistant.
 * These wrap multiple Supabase queries into one useful result rather than
 * making the model issue many individual calls.
 *
 * Tools:
 *   - get_class_summary   — enrolment + submission stats + completion rate for a class
 *   - get_weak_students   — students below a score threshold in a class
 *   - get_topic_breakdown — per-tag accuracy across a class's submissions
 */

import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const GetClassSummaryInput = z.object({
  class_id: z.string().describe('Class UUID'),
  days_back: z.number().int().min(1).max(90).default(14)
    .describe('Look back window in days (default 14)'),
})

export const GetWeakStudentsInput = z.object({
  class_id:        z.string().describe('Class UUID'),
  threshold_pct:   z.number().min(0).max(100).default(60)
    .describe('Students with avg score below this % are flagged (default 60)'),
  limit:           z.number().int().min(1).max(50).default(10),
})

export const GetTopicBreakdownInput = z.object({
  class_id:    z.string().describe('Class UUID'),
  instance_id: z.string().optional().describe('Narrow to a specific assignment instance'),
  limit:       z.number().int().min(1).max(30).default(10),
})

// ─── Tool implementations ────────────────────────────────────────────────────

export async function getClassSummary(
  db: AdminClient,
  input: z.infer<typeof GetClassSummaryInput>,
) {
  const { class_id, days_back } = input
  const since = new Date(Date.now() - days_back * 86_400_000).toISOString()

  // 1. Class info + enrolment count
  const { data: classInfo, error: cErr } = await db
    .from('classes')
    .select('id, title, schedule_text, courses(id, title)')
    .eq('id', class_id)
    .single()

  if (cErr) return { error: cErr.message }

  const { count: enrolmentCount } = await db
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', class_id)

  // 2. Assignment instances for this class
  const { data: instances } = await db
    .from('assignment_instances')
    .select('id, deadline, assignment_id, assignments(title)')
    .eq('class_id', class_id)
    .order('deadline', { ascending: false })
    .limit(10)

  const instanceIds = (instances ?? []).map((i: any) => i.id)

  // 3. Submissions in the look-back window
  const { data: subs } = await db
    .from('submissions')
    .select('id, student_id, instance_id, status, raw_score, total_questions, submitted_at, time_spent_seconds')
    .in('instance_id', instanceIds.length > 0 ? instanceIds : ['__none__'])
    .gte('submitted_at', since)
    .eq('status', 'submitted')

  const rows = (subs ?? []) as any[]
  const completed = rows.filter((s) => s.raw_score !== null && s.total_questions > 0)
  const uniqueStudents = new Set(completed.map((s: any) => s.student_id)).size

  const avgScore =
    completed.length > 0
      ? Math.round(
          (completed.reduce((sum: number, s: any) => sum + (s.raw_score / s.total_questions) * 100, 0) /
            completed.length) *
            10,
        ) / 10
      : null

  const completionRate =
    enrolmentCount && enrolmentCount > 0 && completed.length > 0
      ? Math.round((uniqueStudents / enrolmentCount) * 100)
      : null

  // 4. Recent assignment stats per instance
  const instanceStats = (instances ?? []).slice(0, 5).map((inst: any) => {
    const instSubs = completed.filter((s: any) => s.instance_id === inst.id)
    const instAvg =
      instSubs.length > 0
        ? Math.round(
            (instSubs.reduce(
              (sum: number, s: any) => sum + (s.raw_score / s.total_questions) * 100,
              0,
            ) /
              instSubs.length) *
              10,
          ) / 10
        : null
    return {
      instance_id:     inst.id,
      assignment_title: (inst.assignments as any)?.title ?? 'N/A',
      deadline:        inst.deadline,
      submission_count: instSubs.length,
      avg_score_pct:   instAvg,
    }
  })

  return {
    data: {
      class:             classInfo,
      enrolment_count:   enrolmentCount ?? 0,
      window_days:       days_back,
      total_submissions: completed.length,
      unique_submitters: uniqueStudents,
      avg_score_pct:     avgScore,
      completion_rate_pct: completionRate,
      recent_assignments: instanceStats,
    },
    error: null,
  }
}

export async function getWeakStudents(
  db: AdminClient,
  input: z.infer<typeof GetWeakStudentsInput>,
) {
  const { class_id, threshold_pct, limit } = input

  // All enrolled students
  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('student_id, profiles(id, full_name, email)')
    .eq('class_id', class_id)

  if (eErr) return { error: eErr.message }

  // Assignment instances for this class
  const { data: instances } = await db
    .from('assignment_instances')
    .select('id')
    .eq('class_id', class_id)

  const instanceIds = (instances ?? []).map((i: any) => i.id)
  if (instanceIds.length === 0) {
    return { data: { class_id, weak_students: [], threshold_pct }, error: null }
  }

  // All submitted submissions for this class
  const { data: subs } = await db
    .from('submissions')
    .select('student_id, raw_score, total_questions, submitted_at')
    .in('instance_id', instanceIds)
    .eq('status', 'submitted')
    .not('raw_score', 'is', null)

  const subRows = (subs ?? []) as any[]

  // Compute per-student average
  type StudentStats = { count: number; total_pct: number; last_submitted: string | null }
  const statMap = new Map<string, StudentStats>()
  for (const s of subRows) {
    if (!statMap.has(s.student_id)) {
      statMap.set(s.student_id, { count: 0, total_pct: 0, last_submitted: null })
    }
    const stat = statMap.get(s.student_id)!
    stat.count++
    stat.total_pct += (s.raw_score / s.total_questions) * 100
    if (!stat.last_submitted || s.submitted_at > stat.last_submitted) {
      stat.last_submitted = s.submitted_at
    }
  }

  const weak = (enrollments ?? [])
    .map((e: any) => {
      const profile = e.profiles as any
      const stat = statMap.get(e.student_id)
      const avg = stat && stat.count > 0 ? stat.total_pct / stat.count : null
      return {
        student_id:     e.student_id,
        full_name:      profile?.full_name ?? 'Unknown',
        email:          profile?.email ?? '',
        submission_count: stat?.count ?? 0,
        avg_score_pct:  avg !== null ? Math.round(avg * 10) / 10 : null,
        last_submitted: stat?.last_submitted ?? null,
      }
    })
    .filter((s) => s.avg_score_pct === null || s.avg_score_pct < threshold_pct)
    .sort((a, b) => (a.avg_score_pct ?? -1) - (b.avg_score_pct ?? -1))
    .slice(0, limit)

  return { data: { class_id, threshold_pct, weak_students: weak }, error: null }
}

export async function getTopicBreakdown(
  db: AdminClient,
  input: z.infer<typeof GetTopicBreakdownInput>,
) {
  const { class_id, instance_id, limit } = input

  // Get instance IDs for this class
  let instanceIds: string[]
  if (instance_id) {
    instanceIds = [instance_id]
  } else {
    const { data: instances } = await db
      .from('assignment_instances')
      .select('id')
      .eq('class_id', class_id)
    instanceIds = (instances ?? []).map((i: any) => i.id)
  }

  if (instanceIds.length === 0) {
    return { data: { class_id, topics: [] }, error: null }
  }

  // Get all submissions + answers for these instances
  const { data: submissions } = await db
    .from('submissions')
    .select('id')
    .in('instance_id', instanceIds)
    .eq('status', 'submitted')

  const subIds = (submissions ?? []).map((s: any) => s.id)
  if (subIds.length === 0) {
    return { data: { class_id, topics: [] }, error: null }
  }

  // Get answers with question tags
  const { data: answers, error: aErr } = await db
    .from('submission_answers')
    .select(`
      is_correct,
      questions(
        question_tags(tags(id, name, subject))
      )
    `)
    .in('submission_id', subIds.slice(0, 500)) // cap to avoid huge queries

  if (aErr) return { error: aErr.message }

  // Aggregate by tag
  type TagStat = { name: string; correct: number; total: number }
  const tagMap = new Map<string, TagStat>()

  for (const answer of (answers ?? []) as any[]) {
    const tags = (answer.questions?.question_tags ?? [])
      .map((qt: any) => qt.tags)
      .filter(Boolean)

    for (const tag of tags) {
      if (!tagMap.has(tag.id)) {
        tagMap.set(tag.id, { name: tag.name, correct: 0, total: 0 })
      }
      const stat = tagMap.get(tag.id)!
      stat.total++
      if (answer.is_correct) stat.correct++
    }
  }

  const topics = Array.from(tagMap.values())
    .filter((t) => t.total >= 3) // only meaningful sample sizes
    .map((t) => ({
      tag_name:    t.name,
      total:       t.total,
      correct:     t.correct,
      accuracy_pct: Math.round((t.correct / t.total) * 100),
    }))
    .sort((a, b) => a.accuracy_pct - b.accuracy_pct) // weakest first
    .slice(0, limit)

  return { data: { class_id, topics }, error: null }
}

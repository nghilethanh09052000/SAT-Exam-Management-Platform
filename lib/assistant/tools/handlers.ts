/**
 * lib/assistant/tools/handlers.ts
 *
 * Tool handler implementations for the web assistant route.
 * Mirrors mcp/src/tools/* logic but uses the root app's serviceClient()
 * and applies scope injection.
 *
 * Each handler receives (db, args) and returns a plain object.
 */

import { serviceClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof serviceClient>

// ── Questions ──────────────────────────────────────────────────────────────

export async function list_questions(db: Db, args: Record<string, any>) {
  const { subject, difficulty, type, tag_id, limit = 20 } = args
  const pageSize = Math.min(limit, 100)

  let query = db
    .from('questions')
    .select(
      tag_id
        ? 'id, type, subject, content_preview, difficulty, created_at, question_tags!inner(tags(id, name, subject))'
        : 'id, type, subject, content_preview, difficulty, created_at, question_tags(tags(id, name, subject))',
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(pageSize)

  if (type)       query = (query as any).eq('type', type)
  if (difficulty) query = (query as any).eq('difficulty', difficulty)
  if (subject)    query = (query as any).eq('subject', subject)

  const { data, error } = await query
  if (error) return { error: error.message }

  return {
    data: (data ?? []).map((q: any) => ({
      id:              q.id,
      type:            q.type,
      subject:         q.subject ?? null,
      content_preview: q.content_preview ?? '',
      difficulty:      q.difficulty,
      created_at:      q.created_at,
      tags: (q.question_tags ?? []).map((qt: any) => qt.tags).filter(Boolean),
    })),
    error: null,
  }
}

export async function get_question(db: Db, args: Record<string, any>) {
  const { id } = args
  const { data, error } = await db
    .from('questions')
    .select(`
      id, type, subject, content_preview, difficulty, created_at,
      question_options(label, content, is_correct, order),
      question_accepted_answers(answer_text),
      question_tags(tags(id, name, subject))
    `)
    .eq('id', id)
    .is('archived_at', null)
    .single()

  if (error) return { error: error.message }

  const tags = ((data as any).question_tags ?? []).map((qt: any) => qt.tags).filter(Boolean)
  return { data: { ...(data as any), question_tags: undefined, tags }, error: null }
}

export async function search_questions(db: Db, args: Record<string, any>) {
  const { query, subject, difficulty, type, limit = 20 } = args
  const { data, error } = await (db as any).rpc('search_questions', {
    p_search:           query,
    p_type:             type       ?? null,
    p_difficulty:       difficulty ?? null,
    p_tag_id:           null,
    p_subject:          subject    ?? null,
    p_after_created_at: null,
    p_after_id:         null,
    p_limit:            Math.min(limit, 50),
  })
  if (error) return { error: error.message }
  return { data: data ?? [], error: null }
}

// ── Assignments ────────────────────────────────────────────────────────────

export async function list_assignments(db: Db, args: Record<string, any>) {
  const { created_by, limit = 20 } = args
  let query = db
    .from('assignments')
    .select('id, title, created_by, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (created_by) query = query.eq('created_by', created_by)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}

export async function get_submission_stats(db: Db, args: Record<string, any>) {
  const { assignment_id, instance_id } = args

  let instanceQuery = db
    .from('assignment_instances')
    .select('id, class_id, deadline')
    .eq('assignment_id', assignment_id)

  if (instance_id) instanceQuery = instanceQuery.eq('id', instance_id)

  const { data: instances, error: iErr } = await instanceQuery
  if (iErr) return { error: iErr.message }

  const instanceIds = (instances ?? []).map((i: any) => i.id)
  if (instanceIds.length === 0) return { data: { stats: null }, error: null }

  const { data: subs } = await db
    .from('submissions')
    .select('id, raw_score, total_questions, time_spent_seconds, status')
    .in('instance_id', instanceIds)
    .eq('status', 'submitted')

  const completed = ((subs ?? []) as any[]).filter(
    (s) => s.raw_score !== null && s.total_questions > 0,
  )

  const stats =
    completed.length === 0
      ? null
      : {
          total_submissions: completed.length,
          avg_score_pct:
            Math.round(
              (completed.reduce(
                (sum: number, s: any) => sum + (s.raw_score / s.total_questions) * 100,
                0,
              ) /
                completed.length) *
                10,
            ) / 10,
          avg_time_seconds:
            completed.reduce((sum: number, s: any) => sum + (s.time_spent_seconds ?? 0), 0) /
            completed.length,
        }

  return { data: { stats, submission_count: (subs ?? []).length }, error: null }
}

// ── Students / Classes ─────────────────────────────────────────────────────

export async function list_students(db: Db, args: Record<string, any>) {
  const { search, is_approved, limit = 50 } = args
  let query = db
    .from('profiles')
    .select('id, full_name, email, is_approved, target_score, created_at')
    .eq('role', 'student')
    .is('is_active', true)
    .order('full_name', { ascending: true })
    .limit(Math.min(limit, 100))

  if (is_approved !== undefined) query = query.eq('is_approved', is_approved)

  const { data, error } = await query
  if (error) return { error: error.message }

  let results = (data ?? []) as any[]
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (s) =>
        (s.full_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q),
    )
  }
  return { data: results, error: null }
}

export async function get_student(db: Db, args: Record<string, any>) {
  const { id } = args
  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('id, full_name, email, is_approved, phone, school, city, target_score, created_at')
    .eq('id', id)
    .single()

  if (pErr) return { error: pErr.message }

  const { data: enrollments } = await db
    .from('enrollments')
    .select('id, enrolled_at, classes(id, title, courses(id, title))')
    .eq('student_id', id)

  return {
    data: {
      profile,
      enrollments: ((enrollments ?? []) as any[]).map((e) => ({
        enrollment_id: e.id,
        enrolled_at:   e.enrolled_at,
        class:         e.classes,
      })),
    },
    error: null,
  }
}

export async function list_classes(db: Db, args: Record<string, any>) {
  const { course_id } = args
  let query = db
    .from('classes')
    .select('id, title, schedule_text, created_at, courses(id, title)')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (course_id) query = query.eq('course_id', course_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}

export async function get_class_roster(db: Db, args: Record<string, any>) {
  const { class_id } = args
  const { data: classInfo, error: cErr } = await db
    .from('classes')
    .select('id, title, schedule_text, courses(id, title)')
    .eq('id', class_id)
    .single()

  if (cErr) return { error: cErr.message }

  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('id, enrolled_at, profiles(id, full_name, email, target_score)')
    .eq('class_id', class_id)
    .order('enrolled_at', { ascending: true })

  if (eErr) return { error: eErr.message }

  return {
    data: {
      class: classInfo,
      roster: ((enrollments ?? []) as any[]).map((e) => ({
        enrollment_id: e.id,
        enrolled_at:   e.enrolled_at,
        student:       e.profiles,
      })),
      total: (enrollments ?? []).length,
    },
    error: null,
  }
}

export async function list_courses(db: Db, args: Record<string, any>) {
  const { teacher_id } = args
  let query = db
    .from('courses')
    .select('id, title, teacher_id, created_at, profiles(full_name, email)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (teacher_id) query = query.eq('teacher_id', teacher_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}

// ── Submissions ────────────────────────────────────────────────────────────

export async function get_student_progress(db: Db, args: Record<string, any>) {
  const { student_id, limit = 20 } = args
  const { data, error } = await db
    .from('submissions')
    .select(
      'id, instance_id, attempt_number, status, raw_score, total_questions, submitted_at, time_spent_seconds',
    )
    .eq('student_id', student_id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(Math.min(limit, 50))

  if (error) return { error: error.message }

  const subs = (data ?? []) as any[]
  const enriched = subs.map((s) => ({
    ...s,
    score_pct:
      s.raw_score !== null && s.total_questions > 0
        ? Math.round((s.raw_score / s.total_questions) * 100)
        : null,
  }))

  const completed = enriched.filter((s) => s.score_pct !== null)
  const summary = {
    total_submissions: subs.length,
    avg_score_pct:
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, s) => sum + s.score_pct!, 0) / completed.length,
          )
        : null,
    best_score_pct:
      completed.length > 0 ? Math.max(...completed.map((s) => s.score_pct!)) : null,
  }

  return { data: { summary, submissions: enriched }, error: null }
}

export async function get_class_leaderboard(db: Db, args: Record<string, any>) {
  const { instance_id, top_n = 10 } = args
  const { data, error } = await db
    .from('submissions')
    .select(
      'id, student_id, raw_score, total_questions, submitted_at, time_spent_seconds, profiles(full_name, email)',
    )
    .eq('instance_id', instance_id)
    .eq('status', 'submitted')
    .not('raw_score', 'is', null)
    .order('raw_score', { ascending: false })
    .order('time_spent_seconds', { ascending: true })
    .limit(Math.min(top_n, 50))

  if (error) return { error: error.message }

  return {
    data: ((data ?? []) as any[]).map((s, i) => ({
      rank:        i + 1,
      student:     s.profiles,
      raw_score:   s.raw_score,
      total:       s.total_questions,
      score_pct:
        s.total_questions > 0
          ? Math.round((s.raw_score / s.total_questions) * 100)
          : null,
    })),
    error: null,
  }
}

// ── Analytics (new) ────────────────────────────────────────────────────────

export async function get_class_summary(db: Db, args: Record<string, any>) {
  const { class_id, days_back = 14 } = args
  const since = new Date(Date.now() - days_back * 86_400_000).toISOString()

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

  const { data: instances } = await db
    .from('assignment_instances')
    .select('id, deadline, assignments(title)')
    .eq('class_id', class_id)
    .order('deadline', { ascending: false })
    .limit(10)

  const instanceIds = ((instances ?? []) as any[]).map((i) => i.id)

  const { data: subs } = await db
    .from('submissions')
    .select(
      'id, student_id, instance_id, raw_score, total_questions, submitted_at, time_spent_seconds',
    )
    .in('instance_id', instanceIds.length > 0 ? instanceIds : ['__none__'])
    .gte('submitted_at', since)
    .eq('status', 'submitted')

  const rows = ((subs ?? []) as any[]).filter(
    (s) => s.raw_score !== null && s.total_questions > 0,
  )
  const uniqueStudents = new Set(rows.map((s) => s.student_id)).size

  const avgScore =
    rows.length > 0
      ? Math.round(
          (rows.reduce(
            (sum: number, s: any) => sum + (s.raw_score / s.total_questions) * 100,
            0,
          ) /
            rows.length) *
            10,
        ) / 10
      : null

  return {
    data: {
      class:               classInfo,
      enrolment_count:     enrolmentCount ?? 0,
      window_days:         days_back,
      total_submissions:   rows.length,
      unique_submitters:   uniqueStudents,
      avg_score_pct:       avgScore,
      completion_rate_pct:
        enrolmentCount && enrolmentCount > 0
          ? Math.round((uniqueStudents / enrolmentCount) * 100)
          : null,
    },
    error: null,
  }
}

export async function get_weak_students(db: Db, args: Record<string, any>) {
  const { class_id, threshold_pct = 60, limit = 10 } = args

  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('student_id, profiles(id, full_name, email)')
    .eq('class_id', class_id)

  if (eErr) return { error: eErr.message }

  const { data: instances } = await db
    .from('assignment_instances')
    .select('id')
    .eq('class_id', class_id)

  const instanceIds = ((instances ?? []) as any[]).map((i) => i.id)
  if (instanceIds.length === 0) {
    return { data: { weak_students: [], threshold_pct }, error: null }
  }

  const { data: subs } = await db
    .from('submissions')
    .select('student_id, raw_score, total_questions, submitted_at')
    .in('instance_id', instanceIds)
    .eq('status', 'submitted')
    .not('raw_score', 'is', null)

  type Stat = { count: number; total_pct: number; last: string | null }
  const statMap = new Map<string, Stat>()
  for (const s of ((subs ?? []) as any[])) {
    if (!statMap.has(s.student_id)) statMap.set(s.student_id, { count: 0, total_pct: 0, last: null })
    const stat = statMap.get(s.student_id)!
    stat.count++
    stat.total_pct += (s.raw_score / s.total_questions) * 100
    if (!stat.last || s.submitted_at > stat.last) stat.last = s.submitted_at
  }

  const weak = ((enrollments ?? []) as any[])
    .map((e) => {
      const p = e.profiles as any
      const stat = statMap.get(e.student_id)
      const avg = stat && stat.count > 0 ? stat.total_pct / stat.count : null
      return {
        student_id:       e.student_id,
        full_name:        p?.full_name ?? 'Unknown',
        email:            p?.email ?? '',
        submission_count: stat?.count ?? 0,
        avg_score_pct:    avg !== null ? Math.round(avg * 10) / 10 : null,
        last_submitted:   stat?.last ?? null,
      }
    })
    .filter((s) => s.avg_score_pct === null || s.avg_score_pct < threshold_pct)
    .sort((a, b) => (a.avg_score_pct ?? -1) - (b.avg_score_pct ?? -1))
    .slice(0, limit)

  return { data: { threshold_pct, weak_students: weak }, error: null }
}

// ── Handler map ────────────────────────────────────────────────────────────

export type HandlerFn = (db: Db, args: Record<string, any>) => Promise<unknown>

export const HANDLERS: Record<string, HandlerFn> = {
  list_questions,
  get_question,
  search_questions,
  list_assignments,
  get_submission_stats,
  list_students,
  get_student,
  list_classes,
  get_class_roster,
  list_courses,
  get_student_progress,
  get_class_leaderboard,
  get_class_summary,
  get_weak_students,
}

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'

const CreateInstanceSchema = z.object({
  assignment_id: z.string().min(1),
  class_id: z.string().min(1),
  week_id: z.string().min(1),
  deadline: z.string(),
  is_timed: z.boolean().optional(),
  time_limit_seconds: z.number().nullable().optional(),
  show_results: z.enum(['immediately', 'after_deadline']).optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  max_retakes: z.number().int().optional(),
  alert_enabled: z.boolean().optional(),
  published_at: z.string().nullable().optional(),
  start_at: z.string().nullable().optional(),
  allow_resume: z.boolean().optional(),
  score_visibility: z.enum(['on_submit', 'on_partial', 'after_all_students', 'after_deadline']).optional(),
  answer_visibility: z.enum(['on_submit', 'on_partial', 'after_all_students', 'after_deadline', 'after_score_threshold']).optional(),
  answer_visibility_threshold: z.number().min(0).max(100).nullable().optional(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('class_id')
  const weekId  = searchParams.get('week_id')

  let query = supabase
    .from('assignment_instances')
    .select(
      'id, assignment_id, class_id, week_id, deadline, is_timed, time_limit_seconds, show_results, shuffle_questions, shuffle_options, max_retakes, alert_enabled, published_at, created_at'
    )
    .order('deadline', { ascending: true })

  if (classId) query = query.eq('class_id', classId)
  if (weekId)  query = query.eq('week_id', weekId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export const POST = withTeacher(async (req, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'assignments:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const body = await req.json()
  const parsed = CreateInstanceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  if (profile.role !== 'admin') {
    const [{ data: assignment }, { data: cls }] = await Promise.all([
      db.from('assignments').select('created_by').eq('id', parsed.data.assignment_id).single(),
      db.from('classes').select('course_id').eq('id', parsed.data.class_id).single(),
    ])
    const { data: course } = cls
      ? await db.from('courses').select('teacher_id').eq('id', cls.course_id).single()
      : { data: null }
    if (!assignment || assignment.created_by !== user.id || !course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: existingInstances, error: existingError } = await db
    .from('assignment_instances')
    .select('id')
    .eq('assignment_id', parsed.data.assignment_id)
    .eq('class_id', parsed.data.class_id)
    .limit(1)

  if (existingError) {
    return NextResponse.json({ data: null, error: existingError.message }, { status: 400 })
  }

  if ((existingInstances ?? []).length > 0) {
    return NextResponse.json(
      { data: null, error: 'This assignment is already assigned to the selected class.' },
      { status: 409 }
    )
  }

  const { data, error } = await db
    .from('assignment_instances')
    .insert(parsed.data)
    .select('id, deadline')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

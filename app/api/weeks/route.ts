import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'

const CreateWeekSchema = z.object({
  class_id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().optional(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('class_id')

  let query = supabase
    .from('weeks')
    .select('id, class_id, title, order, created_at')
    .order('order', { ascending: true })

  if (classId) query = query.eq('class_id', classId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export const POST = withTeacher(async (req, { user, profile, db }) => {
  const body = await req.json()
  const parsed = CreateWeekSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  if (profile.role !== 'admin') {
    const { data: cls } = await db.from('classes').select('course_id').eq('id', parsed.data.class_id).single()
    const { data: course } = cls
      ? await db.from('courses').select('teacher_id').eq('id', cls.course_id).single()
      : { data: null }
    if (!course || course.teacher_id !== user.id) {
      return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await db
    .from('weeks')
    .insert(parsed.data)
    .select('id, title, order')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

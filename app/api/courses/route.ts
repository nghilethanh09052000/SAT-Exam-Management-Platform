import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'

const CreateCourseSchema = z.object({
  title: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  expires_at: z.string().nullable().optional(),
  teacher_id: z.string().min(1).optional(),
})

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, start_date, end_date, expires_at, archived_at, created_at, teacher_id')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export const POST = withTeacher(async (req, { user, profile, db }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateCourseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { teacher_id: requestedTeacherId, ...courseFields } = parsed.data
  if (requestedTeacherId && profile.role !== 'admin' && requestedTeacherId !== user.id) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await db
    .from('courses')
    .insert({ ...courseFields, teacher_id: requestedTeacherId ?? user.id })
    .select('id, title, start_date, end_date, archived_at, created_at, teacher_id')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/courses')
  revalidatePath('/admin/courses')
  return NextResponse.json({ data, error: null })
})

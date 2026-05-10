import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const CreateClassSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().min(1),
  schedule_text: z.string().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
})

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')

  let query = supabase
    .from('classes')
    .select('id, course_id, title, schedule_text, start_date, end_date, archived_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (courseId) {
    query = query.eq('course_id', courseId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = createRawClient()
  const { data, error } = await raw
    .from('classes')
    .insert(parsed.data)
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

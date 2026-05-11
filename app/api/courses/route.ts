import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const CreateCourseSchema = z.object({
  title: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  expires_at: z.string().nullable().optional(),
  teacher_id: z.string().min(1).optional(), // Admin can specify a teacher (use min(1) not uuid() to allow non-standard UUIDs in dev)
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

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateCourseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }
  // Admin can create courses on behalf of a teacher; otherwise defaults to self
  const { teacher_id: requestedTeacherId, ...courseFields } = parsed.data
  const effectiveTeacherId = requestedTeacherId ?? user.id

  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await raw
    .from('courses')
    .insert({ ...courseFields, teacher_id: effectiveTeacherId })
    .select('id, title, start_date, end_date, archived_at, created_at, teacher_id')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'
import { revalidatePath } from 'next/cache'

const CreateAssignmentSchema = z.object({
  title: z.string().min(1),
})

export const GET = withTeacher(async (_req, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'assignments:view')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const { data, error } = await db
    .from('assignments')
    .select('id, title, created_by, archived_at, created_at')
    .is('archived_at', null)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

export const POST = withTeacher(async (req, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'assignments:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const body = await req.json()
  const parsed = CreateAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const { data, error } = await db
    .from('assignments')
    .insert({ ...parsed.data, created_by: user.id })
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  revalidatePath('/teacher/assignments')
  return NextResponse.json({ data, error: null })
})

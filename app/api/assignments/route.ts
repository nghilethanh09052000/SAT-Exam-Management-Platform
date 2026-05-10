import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const CreateAssignmentSchema = z.object({
  title: z.string().min(1),
})

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, created_by, archived_at, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const parsed = CreateAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  const raw = createRawClient()
  const { data, error } = await raw
    .from('assignments')
    .insert({ ...parsed.data, created_by: user.id })
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

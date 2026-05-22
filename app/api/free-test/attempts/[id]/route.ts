import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const UpdateProgressSchema = z.object({
  current_question_id: z.string().uuid().nullable().optional(),
  current_module: z.string().nullable().optional(),
})

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const parsed = UpdateProgressSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = serviceRole()
  const { data: attempt } = await raw
    .from('public_exam_attempts')
    .select('id, status')
    .eq('id', params.id)
    .eq('student_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ data: null, error: 'Attempt not found' }, { status: 404 })
  if ((attempt as { status: string }).status !== 'in_progress') {
    return NextResponse.json({ data: null, error: 'Attempt already completed' }, { status: 409 })
  }

  const { data, error } = await raw
    .from('public_exam_attempts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, current_question_id, current_module')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

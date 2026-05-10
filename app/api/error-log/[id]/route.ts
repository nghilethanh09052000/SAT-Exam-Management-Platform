import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createRawClient } from '@/lib/supabase/raw-client'
import { z } from 'zod'

const UpdateErrorLogSchema = z.object({
  student_note: z.string().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateErrorLogSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const raw = createRawClient()
  const { data, error } = await raw
    .from('error_log')
    .update({
      student_note: parsed.data.student_note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('student_id', user.id)
    .select('id, student_note')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
}

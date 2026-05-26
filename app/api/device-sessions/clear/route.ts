import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/with-auth'

export const runtime = 'nodejs'

const ClearSessionsSchema = z.object({
  user_id: z.string().min(1),
})

export const POST = withAdmin(async (req, { db }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClearSessionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data: targetProfile } = await db
    .from('profiles')
    .select('id, full_name')
    .eq('id', parsed.data.user_id)
    .single()

  const target = targetProfile as { id: string; full_name: string } | null
  if (!target) {
    return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 })
  }

  const { count, error } = await db
    .from('device_sessions')
    .delete({ count: 'exact' })
    .eq('user_id', parsed.data.user_id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      cleared: count ?? 0,
      user_id: target.id,
      full_name: target.full_name,
    },
    error: null,
  })
})

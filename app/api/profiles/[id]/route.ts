import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  birth_year: z.number().int().min(1990).max(2020).nullable().optional(),
  gender: z.string().nullable().optional(),
  school: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  facebook_url: z.string().nullable().optional(),
  threads_url: z.string().nullable().optional(),
  hobbies: z.string().nullable().optional(),
  target_score: z.number().int().min(400).max(1600).nullable().optional(),
  source: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

export const PATCH = withAnyAuth<{ id: string }>(async (req, { user, profile, db, params }) => {
  const body = await req.json()
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const isSelfUpdate = params.id === user.id
  const isAdmin = profile.role === 'admin'
  if (!isSelfUpdate && !isAdmin) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }
  if (!isAdmin && parsed.data.is_active !== undefined) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })
  }

  if (parsed.data.full_name) {
    const { data: userData } = await db.auth.admin.getUserById(params.id)
    const metadata = userData.user?.user_metadata ?? {}
    await db.auth.admin.updateUserById(params.id, {
      user_metadata: {
        ...metadata,
        full_name: parsed.data.full_name,
      },
    })
  }

  const { data, error } = await db
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq('id', params.id)
    .select('id, full_name, phone, is_active, created_at, birth_year, gender, school, city, facebook_url, threads_url, hobbies, target_score, source')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

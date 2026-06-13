/**
 * GET/PUT /api/performance-thresholds
 *
 * Per-teacher accuracy thresholds that map a student's accuracy % to a
 * status tier on the analytics dashboard:
 *   >= excellent_pct → "Vượt mục tiêu"
 *   >= target_pct    → "Đạt mục tiêu"
 *   >= watch_pct     → "Cần theo dõi"
 *   below            → "Nguy hiểm"
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'

export const runtime = 'nodejs'

const DEFAULTS = { excellent_pct: 85, target_pct: 70, watch_pct: 50 }

const ThresholdsSchema = z
  .object({
    excellent_pct: z.number().min(0).max(100),
    target_pct: z.number().min(0).max(100),
    watch_pct: z.number().min(0).max(100),
  })
  .refine((v) => v.excellent_pct >= v.target_pct && v.target_pct >= v.watch_pct, {
    message: 'Thresholds must be ordered: excellent >= target >= watch',
  })

export const GET = withTeacher(async (_req, { user, db }) => {
  const { data } = await db
    .from('performance_thresholds')
    .select('excellent_pct, target_pct, watch_pct')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return NextResponse.json({ data: data ?? DEFAULTS, error: null })
})

export const PUT = withTeacher(async (req, { user, db }) => {
  const body = await req.json()
  const parsed = ThresholdsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })
  }

  const { data, error } = await db
    .from('performance_thresholds')
    .upsert(
      { teacher_id: user.id, ...parsed.data, updated_at: new Date().toISOString() } as never,
      { onConflict: 'teacher_id' }
    )
    .select('excellent_pct, target_pct, watch_pct')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  return NextResponse.json({ data, error: null })
})

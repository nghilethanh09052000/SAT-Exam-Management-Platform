import { NextResponse } from 'next/server'
import { withAnyAuth } from '@/lib/with-auth'

export const runtime = 'nodejs'

type StreakRow = {
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  total_days_active: number
}

type ActivityRow = {
  activity_date: string
  exercises_completed: number
}

export const GET = withAnyAuth(async (_req, { user, db }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any

  const since = new Date()
  since.setDate(since.getDate() - 111)

  const [{ data: streak }, { data: activity }] = await Promise.all([
    sb.from('student_streaks')
      .select('current_streak, longest_streak, last_activity_date, total_days_active')
      .eq('student_id', user.id)
      .maybeSingle() as Promise<{ data: StreakRow | null }>,

    sb.from('daily_activity')
      .select('activity_date, exercises_completed')
      .eq('student_id', user.id)
      .gte('activity_date', since.toISOString().slice(0, 10))
      .order('activity_date', { ascending: true }) as Promise<{ data: ActivityRow[] | null }>,
  ])

  return NextResponse.json({
    streak: streak ?? { current_streak: 0, longest_streak: 0, last_activity_date: null, total_days_active: 0 },
    activity: activity ?? [],
  })
})

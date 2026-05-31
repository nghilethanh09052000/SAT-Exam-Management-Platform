import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { AssignmentDetailClient } from './assignment-detail-client'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface PageProps {
  params: { id: string; locale: string }
}

function rawClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// These interfaces match the types in assignment-detail-client.tsx
interface PageAssignment {
  id: string
  title: string
  created_at: string
}

interface PageQuestion {
  id: string
  order: number
  score_weight: number
  module: string
  question: {
    id: string
    type: string
    content: string
    difficulty: string | null
    // ai_explanation, teacher_explanation, options and accepted_answers are
    // fetched lazily via GET /api/questions/[id] when teacher clicks "Xem"
  }
}

interface PageInstance {
  id: string
  class_id: string
  week_id: string
  deadline: string
  published_at: string | null
  is_timed: boolean
  time_limit_seconds: number | null
  max_retakes: number
  classes: { id: string; title: string } | null
  weeks: { id: string; title: string } | null
}

interface PageSubmission {
  id: string
  instance_id: string
  student_id: string
  attempt_number: number
  status: string
  raw_score: number | null
  total_questions: number | null
  submitted_at: string | null
  time_spent_seconds: number | null
  profiles: { full_name: string; phone: string | null } | null
}

export default async function AssignmentDetailPage({ params }: PageProps) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.assignments')
  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const supabase = createServerClient()
  const raw = rawClient()

  // Batch 1: run independent queries in parallel
  const [assignResult, instancesResult, questionsResult] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, title, created_at')
      .eq('id', params.id)
      .single(),
    supabase
      .from('assignment_instances')
      .select('id, class_id, week_id, deadline, published_at, is_timed, time_limit_seconds, max_retakes, classes(id, title), weeks(id, title)')
      .eq('assignment_id', params.id)
      .order('deadline', { ascending: true }),
    // Lightweight list — no ai_explanation, teacher_explanation, options or
    // accepted_answers. Full detail is fetched lazily via /api/questions/[id]
    // when the teacher clicks "Xem" in the modal.
    supabase
      .from('assignment_questions')
      .select('id, order, score_weight, module, question:questions(id, type, content, difficulty)')
      .eq('assignment_id', params.id)
      .order('order', { ascending: true }),
  ])

  const assignment = assignResult.data as PageAssignment | null
  if (!assignment) notFound()

  const instances: PageInstance[] = ((instancesResult.data as PageInstance[] | null) ?? [])
  const questions: PageQuestion[] = ((questionsResult.data as PageQuestion[] | null) ?? []).map((row) => ({
    ...row,
    question: {
      ...row.question,
      content: row.question.content.length > 260
        ? `${row.question.content.slice(0, 260).trim()}...`
        : row.question.content,
    },
  }))

  // Batch 2: submissions depend on instance IDs from batch 1
  const instanceIds = instances.map((i) => i.id)
  const submissionsResult = instanceIds.length > 0
    ? await raw
        .from('submissions')
        .select('id, instance_id, student_id, attempt_number, status, raw_score, total_questions, submitted_at, time_spent_seconds, profiles(full_name, phone)')
        .in('instance_id', instanceIds)
        .order('submitted_at', { ascending: false })
    : { data: [] as PageSubmission[] }

  const submissions: PageSubmission[] = (submissionsResult.data as PageSubmission[] | null) ?? []

  return (
    <div>
      <PageHeader
        title={assignment.title}
        description={t('createdOn', { date: new Date(assignment.created_at).toLocaleDateString(dateLocale, { timeZone: 'Asia/Ho_Chi_Minh' }) })}
        breadcrumbs={[
          { label: t('breadcrumbAssignments'), href: '/teacher/assignments' },
          { label: assignment.title },
        ]}
      />

      <AssignmentDetailClient
        assignment={assignment}
        instances={instances}
        submissions={submissions}
        questions={questions}
      />
    </div>
  )
}

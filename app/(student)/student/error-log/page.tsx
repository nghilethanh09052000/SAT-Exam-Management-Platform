import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ErrorLogClient } from './error-log-client'

interface Option {
  id: string
  label: string
  content: string
  is_correct: boolean
  order: number
}

interface LogEntry {
  id: string
  questionId: string
  submissionId: string
  studentNote: string | null
  createdAt: string
  assignmentTitle: string
  question: {
    content: string
    type: string
    options: Option[]
  } | null
}

export default async function ErrorLogPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rawLogsResult = await supabase
    .from('error_log')
    .select(
      'id, student_note, created_at, question_id, submission_id'
    )
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  type RawLog = {
    id: string
    student_note: string | null
    created_at: string
    question_id: string
    submission_id: string
  }
  const logs: RawLog[] = (rawLogsResult.data as RawLog[] | null) ?? []

  // Fetch related data separately
  const questionIds = Array.from(new Set(logs.map((l) => l.question_id)))
  const { data: questionsData } = questionIds.length > 0
    ? await supabase
        .from('questions')
        .select('id, type, content, question_options(id, label, content, is_correct, order)')
        .in('id', questionIds)
    : { data: [] }

  type SubRow = { id: string; instance_id: string }
  type InstRow = { id: string; assignment_id: string }
  type AsgRow = { id: string; title: string }

  const submissionIds = Array.from(new Set(logs.map((l) => l.submission_id)))
  const subsResult = submissionIds.length > 0
    ? await supabase.from('submissions').select('id, instance_id').in('id', submissionIds)
    : { data: [] as SubRow[] }
  const subsData: SubRow[] = (subsResult.data as SubRow[] | null) ?? []

  const instanceIds = Array.from(new Set(subsData.map((s) => s.instance_id)))
  const instsResult = instanceIds.length > 0
    ? await supabase.from('assignment_instances').select('id, assignment_id').in('id', instanceIds)
    : { data: [] as InstRow[] }
  const instancesData: InstRow[] = (instsResult.data as InstRow[] | null) ?? []

  const assignmentIds = Array.from(new Set(instancesData.map((i) => i.assignment_id)))
  const asgsResult = assignmentIds.length > 0
    ? await supabase.from('assignments').select('id, title').in('id', assignmentIds)
    : { data: [] as AsgRow[] }
  const assignmentsData: AsgRow[] = (asgsResult.data as AsgRow[] | null) ?? []

  // Build lookup maps
  type QuestionWithOptions = {
    id: string
    type: string
    content: string
    question_options: Option[]
  }
  const qMap = new Map<string, QuestionWithOptions>(
    (questionsData as QuestionWithOptions[] | null ?? []).map((q) => [q.id, q])
  )
  const subMap = new Map(subsData.map((s) => [s.id, s.instance_id]))
  const instMap = new Map(instancesData.map((i) => [i.id, i.assignment_id]))
  const asgMap = new Map(assignmentsData.map((a) => [a.id, a.title])
  )

  const entries: LogEntry[] = logs.map((log) => {
    const q = qMap.get(log.question_id)
    const instanceId = subMap.get(log.submission_id)
    const assignmentId = instanceId ? instMap.get(instanceId) : undefined
    const title = assignmentId ? asgMap.get(assignmentId) : undefined

    return {
      id: log.id,
      questionId: log.question_id,
      submissionId: log.submission_id,
      studentNote: log.student_note,
      createdAt: log.created_at,
      assignmentTitle: title ?? '—',
      question: q
        ? {
            content: q.content,
            type: q.type,
            options: [...q.question_options].sort((a, b) => a.order - b.order),
          }
        : null,
    }
  })

  return <ErrorLogClient logs={entries} />
}

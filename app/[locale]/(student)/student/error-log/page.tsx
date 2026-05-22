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
  assignmentId: string | null
  weekId: string | null
  weekTitle: string
  weekOrder: number
  sourceType: 'weekly' | 'practice' | 'mock'
  attemptNumber: number | null
  skillTags: string[]
  selectedOptionId: string | null
  answerText: string | null
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

  type SubRow = { id: string; instance_id: string; attempt_number: number }
  type InstRow = {
    id: string
    assignment_id: string
    week_id: string | null
    weeks: { id: string; title: string; order: number } | null
    classes: { title: string | null; courses: { title: string | null } | null } | null
  }
  type AsgRow = { id: string; title: string }
  type AnswerRow = {
    submission_id: string
    question_id: string
    selected_option_id: string | null
    answer_text: string | null
  }
  type TagRow = {
    question_id: string
    tags: { name: string } | null
  }

  const submissionIds = Array.from(new Set(logs.map((l) => l.submission_id)))
  const subsResult = submissionIds.length > 0
    ? await supabase.from('submissions').select('id, instance_id, attempt_number').in('id', submissionIds)
    : { data: [] as SubRow[] }
  const subsData: SubRow[] = (subsResult.data as SubRow[] | null) ?? []

  const instanceIds = Array.from(new Set(subsData.map((s) => s.instance_id)))
  const instsResult = instanceIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, assignment_id, week_id, weeks(id, title, order), classes(title, courses(title))')
        .in('id', instanceIds)
    : { data: [] as InstRow[] }
  const instancesData: InstRow[] = (instsResult.data as InstRow[] | null) ?? []

  const assignmentIds = Array.from(new Set(instancesData.map((i) => i.assignment_id)))
  const asgsResult = assignmentIds.length > 0
    ? await supabase.from('assignments').select('id, title').in('id', assignmentIds)
    : { data: [] as AsgRow[] }
  const assignmentsData: AsgRow[] = (asgsResult.data as AsgRow[] | null) ?? []

  const answersResult = submissionIds.length > 0 && questionIds.length > 0
    ? await supabase
        .from('submission_answers')
        .select('submission_id, question_id, selected_option_id, answer_text')
        .in('submission_id', submissionIds)
        .in('question_id', questionIds)
    : { data: [] as AnswerRow[] }
  const answersData: AnswerRow[] = (answersResult.data as AnswerRow[] | null) ?? []

  const tagsResult = questionIds.length > 0
    ? await supabase
        .from('question_tags')
        .select('question_id, tags(name)')
        .in('question_id', questionIds)
    : { data: [] as TagRow[] }
  const tagsData: TagRow[] = (tagsResult.data as TagRow[] | null) ?? []

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
  const subMap = new Map(subsData.map((s) => [s.id, s]))
  const instMap = new Map(instancesData.map((i) => [i.id, i]))
  const asgMap = new Map(assignmentsData.map((a) => [a.id, a.title])
  )
  const answerMap = new Map(
    answersData.map((answer) => [`${answer.submission_id}:${answer.question_id}`, answer])
  )
  const tagMap = new Map<string, string[]>()
  for (const row of tagsData) {
    const existing = tagMap.get(row.question_id) ?? []
    if (row.tags?.name) existing.push(row.tags.name)
    tagMap.set(row.question_id, existing)
  }

  function inferSourceType(title: string, courseTitle?: string | null): LogEntry['sourceType'] {
    const text = `${title} ${courseTitle ?? ''}`.toLowerCase()
    if (/(thi thử|mock|practice test|full mixed|full test|sat test|test\s*\d|test\b)/i.test(text)) return 'mock'
    if (/(luyện đề|luyen de|practice|drill|exercise|bài luyện|bai luyen)/i.test(text)) return 'practice'
    return 'weekly'
  }

  const entries: LogEntry[] = logs.map((log) => {
    const q = qMap.get(log.question_id)
    const submission = subMap.get(log.submission_id)
    const instanceId = submission?.instance_id
    const instance = instanceId ? instMap.get(instanceId) : undefined
    const assignmentId = instance?.assignment_id
    const title = assignmentId ? asgMap.get(assignmentId) : undefined
    const answer = answerMap.get(`${log.submission_id}:${log.question_id}`)
    const courseTitle = instance?.classes?.courses?.title ?? null

    return {
      id: log.id,
      questionId: log.question_id,
      submissionId: log.submission_id,
      studentNote: log.student_note,
      createdAt: log.created_at,
      assignmentTitle: title ?? '—',
      assignmentId: assignmentId ?? null,
      weekId: instance?.week_id ?? null,
      weekTitle: instance?.weeks?.title ?? 'Chưa phân tuần',
      weekOrder: instance?.weeks?.order ?? Number.MAX_SAFE_INTEGER,
      sourceType: inferSourceType(title ?? '', courseTitle),
      attemptNumber: submission?.attempt_number ?? null,
      skillTags: tagMap.get(log.question_id) ?? [],
      selectedOptionId: answer?.selected_option_id ?? null,
      answerText: answer?.answer_text ?? null,
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

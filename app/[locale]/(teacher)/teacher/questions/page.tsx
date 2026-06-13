import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { QuestionBankClient } from './question-bank-client'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface RawQuestionRow {
  id: string
  type: string
  subject: string | null
  content_preview: string | null
  difficulty: string | null
  created_at: string
  question_tags?: {
    tags: { id: string; name: string; subject: string } | null
  }[]
}

interface TagRow {
  id: string
  name: string
  subject: string
}

// ── Stats: always-fresh DB aggregate (6 rows max) ─────────────────────────────
// Uses a service-role client so RLS is bypassed and the count reflects ALL
// questions, not just those visible to the current teacher.
// We deliberately do NOT cache this value — bulk-imported questions bypass the
// API (and therefore never call revalidateTag), so any cache would go stale.
// The get_question_stats() RPC returns at most 6 rows (one per type×difficulty
// combination) so the query is negligibly cheap even without caching.
async function fetchStats() {
  try {
    const raw = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (raw as any).rpc('get_question_stats')
    if (error) {
      console.error('[QuestionBank] get_question_stats RPC failed:', error.message)
      return null
    }
    const rows = (data ?? []) as { type: string; difficulty: string | null; cnt: number }[]
    return {
      total:          rows.reduce((s, r) => s + Number(r.cnt), 0),
      multipleChoice: rows.filter((r) => r.type === 'multiple_choice').reduce((s, r) => s + Number(r.cnt), 0),
      shortAnswer:    rows.filter((r) => r.type === 'short_answer').reduce((s, r) => s + Number(r.cnt), 0),
      easy:           rows.filter((r) => r.difficulty === 'easy').reduce((s, r) => s + Number(r.cnt), 0),
      medium:         rows.filter((r) => r.difficulty === 'medium').reduce((s, r) => s + Number(r.cnt), 0),
      hard:           rows.filter((r) => r.difficulty === 'hard').reduce((s, r) => s + Number(r.cnt), 0),
    }
  } catch (err) {
    console.error('[QuestionBank] fetchStats threw:', err)
    return null
  }
}

const PAGE_SIZE = 20

export default async function QuestionBankPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.questions')
  const supabase = createServerClient()

  const [
    { data: firstPageRaw, error: questionsError },
    statsResult,
    { data: tagsResult, error: tagsError },
  ] = await Promise.all([
    // First page — content_preview instead of full content (~58× smaller payload)
    supabase
      .from('questions')
      .select('id, type, subject, content_preview, difficulty, created_at, question_tags(tags(id, name, subject))')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(PAGE_SIZE + 1),

    // Stats: always-fresh DB aggregate (no cache — bulk imports bypass revalidateTag)
    fetchStats(),

    supabase
      .from('tags')
      .select('id, name, subject')
      .order('subject', { ascending: true })
      .order('name',    { ascending: true }),
  ])

  // Fallback stats: if the RPC is unavailable (e.g. migration not yet applied),
  // derive approximate counts from the first page + hasNext flag.
  const rawRows    = (firstPageRaw as RawQuestionRow[] | null) ?? []
  const hasNext    = rawRows.length > PAGE_SIZE
  const pageRows   = rawRows.slice(0, PAGE_SIZE)

  // Provenance: which sets each first-page question already belongs to.
  const { data: sourcesRaw } = pageRows.length > 0
    ? await supabase
        .from('assignment_questions')
        .select('question_id, assignments(title)')
        .in('question_id', pageRows.map((q) => q.id))
    : { data: [] as { question_id: string; assignments: { title: string } | null }[] }
  const sourcesByQuestion = new Map<string, string[]>()
  for (const row of (sourcesRaw as { question_id: string; assignments: { title: string } | null }[] | null) ?? []) {
    if (!row.assignments?.title) continue
    const list = sourcesByQuestion.get(row.question_id) ?? []
    if (!list.includes(row.assignments.title)) list.push(row.assignments.title)
    sourcesByQuestion.set(row.question_id, list)
  }

  const firstPage  = pageRows.map((q) => ({
    id:              q.id,
    type:            q.type,
    subject:         q.subject ?? null,
    content_preview: q.content_preview ?? '',
    difficulty:      q.difficulty,
    created_at:      q.created_at,
    tags: (q.question_tags ?? [])
      .map((qt) => qt.tags)
      .filter((t): t is TagRow => Boolean(t)),
    sources: sourcesByQuestion.get(q.id) ?? [],
  }))

  const stats = statsResult ?? {
    total:          firstPage.length + (hasNext ? 1 : 0), // best-effort
    multipleChoice: firstPage.filter((q) => q.type === 'multiple_choice').length,
    shortAnswer:    firstPage.filter((q) => q.type === 'short_answer').length,
    easy:           firstPage.filter((q) => q.difficulty === 'easy').length,
    medium:         firstPage.filter((q) => q.difficulty === 'medium').length,
    hard:           firstPage.filter((q) => q.difficulty === 'hard').length,
  }

  if (questionsError) console.error('[QuestionBank] questions query failed:', questionsError.message, questionsError.code)
  if (tagsError)      console.error('[QuestionBank] tags query failed:',      tagsError.message,      tagsError.code)

  const tags: TagRow[] = (tagsResult as TagRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('totalCount', { count: stats.total })}
        action={
          <div className="flex items-center gap-2">
            <Link href="/teacher/questions/upload">
              <Button variant="secondary">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mr-1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {t('uploadDocx')}
              </Button>
            </Link>
            <Link href="/teacher/questions/new">
              <Button>{t('createNew')}</Button>
            </Link>
          </div>
        }
      />

      <QuestionBankClient
        initialQuestions={firstPage}
        initialHasNext={hasNext}
        stats={stats}
        tags={tags}
      />
    </div>
  )
}

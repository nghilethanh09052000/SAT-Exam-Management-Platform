import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { QuestionBankClient } from './question-bank-client'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface RawQuestionRow {
  id: string
  type: string
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

// ── Stats: cached for 60 s, computed by DB aggregate (6 rows max) ────────────
// Uses service-role client inside the cache so the function is independent of
// the per-request cookie session and can be shared across all teacher renders.
const getCachedStats = unstable_cache(
  async () => {
    const raw = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (raw as any).rpc('get_question_stats')
    const rows = (data ?? []) as { type: string; difficulty: string | null; cnt: number }[]
    return {
      total:          rows.reduce((s, r) => s + Number(r.cnt), 0),
      multipleChoice: rows.filter((r) => r.type === 'multiple_choice').reduce((s, r) => s + Number(r.cnt), 0),
      shortAnswer:    rows.filter((r) => r.type === 'short_answer').reduce((s, r) => s + Number(r.cnt), 0),
      easy:           rows.filter((r) => r.difficulty === 'easy').reduce((s, r) => s + Number(r.cnt), 0),
      medium:         rows.filter((r) => r.difficulty === 'medium').reduce((s, r) => s + Number(r.cnt), 0),
      hard:           rows.filter((r) => r.difficulty === 'hard').reduce((s, r) => s + Number(r.cnt), 0),
    }
  },
  ['question-bank-stats'],
  { revalidate: 60, tags: ['questions'] }
)

const PAGE_SIZE = 20

export default async function QuestionBankPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.questions')
  const supabase = createServerClient()

  const [
    { data: firstPageRaw, error: questionsError },
    stats,
    { data: tagsResult, error: tagsError },
  ] = await Promise.all([
    // First page — content_preview instead of full content (~58× smaller payload)
    supabase
      .from('questions')
      .select('id, type, content_preview, difficulty, created_at, question_tags(tags(id, name, subject))')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(PAGE_SIZE + 1),

    // Stats: 6-row aggregate cached for 60 s, no more full-table transfer
    getCachedStats(),

    supabase
      .from('tags')
      .select('id, name, subject')
      .order('subject', { ascending: true })
      .order('name',    { ascending: true }),
  ])

  if (questionsError) console.error('[QuestionBank] questions query failed:', questionsError.message, questionsError.code)
  if (tagsError)      console.error('[QuestionBank] tags query failed:',      tagsError.message,      tagsError.code)

  const rawRows    = (firstPageRaw as RawQuestionRow[] | null) ?? []
  const hasNext    = rawRows.length > PAGE_SIZE
  const firstPage  = rawRows.slice(0, PAGE_SIZE).map((q) => ({
    id:              q.id,
    type:            q.type,
    content_preview: q.content_preview ?? '',
    difficulty:      q.difficulty,
    created_at:      q.created_at,
    tags: (q.question_tags ?? [])
      .map((qt) => qt.tags)
      .filter((t): t is TagRow => Boolean(t)),
  }))

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

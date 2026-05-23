import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { QuestionBankClient } from './question-bank-client'

interface RawQuestionRow {
  id: string
  type: string
  content: string
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

const PAGE_SIZE = 20

export default async function QuestionBankPage() {
  const supabase = createServerClient()

  const [
    { data: firstPageRaw },
    { data: statsRows },
    { data: tagsResult },
  ] = await Promise.all([
    // First page only — keyset cursor starts with no WHERE condition
    supabase
      .from('questions')
      .select('id, type, content, difficulty, created_at, question_tags(tags(id, name, subject))')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(PAGE_SIZE + 1),

    // Lightweight stats — only 2 columns, no content
    supabase
      .from('questions')
      .select('type, difficulty')
      .is('archived_at', null),

    supabase
      .from('tags')
      .select('id, name, subject')
      .order('subject', { ascending: true })
      .order('name',    { ascending: true }),
  ])

  const rawRows    = (firstPageRaw as RawQuestionRow[] | null) ?? []
  const hasNext    = rawRows.length > PAGE_SIZE
  const firstPage  = rawRows.slice(0, PAGE_SIZE).map((q) => ({
    id:         q.id,
    type:       q.type,
    content:    q.content,
    difficulty: q.difficulty,
    created_at: q.created_at,
    tags: (q.question_tags ?? [])
      .map((qt) => qt.tags)
      .filter((t): t is TagRow => Boolean(t)),
  }))

  const sr = (statsRows as { type: string; difficulty: string | null }[] | null) ?? []
  const stats = {
    total:          sr.length,
    multipleChoice: sr.filter((r) => r.type === 'multiple_choice').length,
    shortAnswer:    sr.filter((r) => r.type === 'short_answer').length,
    easy:           sr.filter((r) => r.difficulty === 'easy').length,
    medium:         sr.filter((r) => r.difficulty === 'medium').length,
    hard:           sr.filter((r) => r.difficulty === 'hard').length,
  }

  const tags: TagRow[] = (tagsResult as TagRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        description={`${stats.total} câu hỏi`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/teacher/questions/upload">
              <Button variant="secondary">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mr-1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Tải lên .docx
              </Button>
            </Link>
            <Link href="/teacher/questions/new">
              <Button>Tạo câu hỏi</Button>
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

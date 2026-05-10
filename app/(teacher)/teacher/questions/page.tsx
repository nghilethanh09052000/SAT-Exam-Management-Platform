import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface QuestionRow {
  id: string
  type: string
  content: string
  difficulty: string | null
  created_at: string
}

export default async function QuestionBankPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const questionsResult = await supabase
    .from('questions')
    .select('id, type, content, difficulty, created_at')
    .eq('created_by', user?.id ?? '')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const questions: QuestionRow[] = (questionsResult.data as QuestionRow[] | null) ?? []

  function getDifficultyBadge(diff: string | null) {
    if (!diff) return null
    const variants: Record<string, 'success' | 'warning' | 'error'> = {
      easy: 'success',
      medium: 'warning',
      hard: 'error',
    }
    const labels: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
    return (
      <Badge variant={variants[diff] ?? 'default'}>
        {labels[diff] ?? diff}
      </Badge>
    )
  }

  function getTypeBadge(type: string) {
    return type === 'multiple_choice' ? (
      <Badge variant="info">Trắc nghiệm</Badge>
    ) : (
      <Badge variant="default">Điền đáp án</Badge>
    )
  }

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        description={`${questions.length} câu hỏi`}
        action={
          <Link href="/teacher/questions/new">
            <Button>Tạo câu hỏi</Button>
          </Link>
        }
      />

      {questions.length === 0 ? (
        <EmptyState
          title="Chưa có câu hỏi nào"
          description="Tạo câu hỏi đầu tiên cho ngân hàng câu hỏi"
          action={
            <Link href="/teacher/questions/new">
              <Button>Tạo câu hỏi</Button>
            </Link>
          }
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-4 px-5 py-4 bg-surface-card rounded-card hover:bg-surface-soft transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate max-w-2xl">
                  {q.content.slice(0, 120)}
                  {q.content.length > 120 ? '...' : ''}
                </p>
                <p className="text-xs text-mute-light mt-1">
                  {new Date(q.created_at).toLocaleDateString('vi-VN')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getTypeBadge(q.type)}
                {getDifficultyBadge(q.difficulty)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

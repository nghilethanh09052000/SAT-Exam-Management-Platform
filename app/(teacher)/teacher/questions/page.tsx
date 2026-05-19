import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { QuestionBankClient } from './question-bank-client'

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

  const { data: questionsResult } = await supabase
    .from('questions')
    .select('id, type, content, difficulty, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const questions: QuestionRow[] = (questionsResult as QuestionRow[] | null) ?? []

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        description={`${questions.length} câu hỏi`}
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

      <QuestionBankClient questions={questions} />
    </div>
  )
}

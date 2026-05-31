import { createServerClient } from '@/lib/supabase/server'
import { NewExamPaperWizard } from './new-exam-paper-wizard'

interface Question {
  id: string
  type: string
  subject: string | null
  content: string
  difficulty: string | null
  tags: { tag: { id: string; subject: string; name: string } }[]
}

export default async function NewExamPaperPage() {
  const supabase = createServerClient()

  const { data: questionsData } = await supabase
    .from('questions')
    .select('id, type, subject, content, difficulty, tags:question_tags(tag:tags(id, subject, name))')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const questions: Question[] = (questionsData as Question[] | null) ?? []

  return <NewExamPaperWizard questions={questions} />
}

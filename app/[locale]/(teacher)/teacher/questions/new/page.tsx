import { createServerClient } from '@/lib/supabase/server'
import { NewQuestionForm } from './new-question-form'

interface Tag {
  id: string
  subject: string
  name: string
}

export default async function NewQuestionPage() {
  const supabase = createServerClient()

  const { data: tagsData } = await supabase
    .from('tags')
    .select('id, subject, name')
    .order('subject')
    .order('name')

  const tags: Tag[] = (tagsData as Tag[] | null) ?? []

  return <NewQuestionForm tags={tags} />
}

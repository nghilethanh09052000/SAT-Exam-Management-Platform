import { createServerClient } from '@/lib/supabase/server'
import { UploadDocxClient } from './upload-client'

interface Tag {
  id: string
  subject: string
  name: string
}

export default async function UploadDocxPage() {
  const supabase = createServerClient()

  // Load all tags so the review step can show a tag picker per question
  const { data: tagsData } = await supabase
    .from('tags')
    .select('id, subject, name')
    .order('subject')
    .order('name')

  const tags: Tag[] = (tagsData as Tag[] | null) ?? []

  return <UploadDocxClient tags={tags} />
}

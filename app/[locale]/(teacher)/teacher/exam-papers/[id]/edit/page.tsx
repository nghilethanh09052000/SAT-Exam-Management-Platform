import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { EditExamPaperForm } from './edit-exam-paper-form'

interface ExamPaperRow {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  created_by: string
}

export default async function EditExamPaperPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.examPapers')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: paperData, error } = await supabase
    .from('exam_papers')
    .select('id, title, source, year, description, created_by')
    .eq('id', params.id)
    .is('archived_at', null)
    .single()

  if (error || !paperData) return notFound()
  const paper = paperData as ExamPaperRow

  // Only the owner or an admin may edit — mirrors canEdit on the detail page and
  // the PATCH authz (assertTeacherOwnsExamPaper).
  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  const isAdmin = (profileData as { role: string } | null)?.role === 'admin'
  if (!isAdmin && paper.created_by !== user?.id) return notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#607083]">
          <Link href="/teacher/exam-papers" className="transition-colors hover:text-[#0c5ea8]">
            {t('breadcrumb')}
          </Link>
          <span className="text-[#9aa9b8]">/</span>
          <Link href={`/teacher/exam-papers/${paper.id}`} className="min-w-0 truncate transition-colors hover:text-[#0c5ea8]">
            {paper.title}
          </Link>
          <span className="text-[#9aa9b8]">/</span>
          <span className="text-ink">{t('editBtn')}</span>
        </nav>
        <h1 className="font-display text-3xl font-black tracking-tight text-ink">{t('editTitle')}</h1>
        <p className="text-sm font-semibold text-[#708095]">{t('editSubtitle')}</p>
      </div>

      <EditExamPaperForm
        paper={{
          id: paper.id,
          title: paper.title,
          source: paper.source,
          year: paper.year,
          description: paper.description,
        }}
      />
    </div>
  )
}

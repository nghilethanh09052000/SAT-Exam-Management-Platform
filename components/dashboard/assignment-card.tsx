import { getTranslations, getLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import type { SubmissionStatus } from '@/types'

interface AssignmentCardProps {
  instanceId: string
  title: string
  deadline: string
  status: SubmissionStatus | 'not_started'
  submissionId?: string
  readOnly?: boolean
}

function statusTone(status: AssignmentCardProps['status']) {
  switch (status) {
    case 'not_started':
      return 'from-[#eaf1ff] to-[#f7fbff] border-[#dfe8ff]'
    case 'in_progress':
      return 'from-[#fff6df] to-[#fffaf0] border-[#ffe4a8]'
    case 'grading':
      return 'from-[#fff6df] to-[#fffaf0] border-[#ffe4a8]'
    case 'submitted':
      return 'from-[#eafaf1] to-[#f8fffb] border-[#d2f4df]'
    case 'expired':
      return 'from-[#fff0f2] to-[#fff8f8] border-[#ffd4dc]'
  }
}

function formatDeadline(deadline: string, locale: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const d = new Date(deadline)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  const dateLocale = locale === 'vi' ? 'vi-VN' : 'en-US'
  const formatted = d.toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (diff < 0) return { text: formatted, countdown: t('deadlineExpired'), urgent: true }
  if (days === 0) return { text: formatted, countdown: t('deadlineToday'), urgent: true }
  if (days === 1) return { text: formatted, countdown: t('deadlineTomorrow'), urgent: true }
  return { text: formatted, countdown: t('deadlineDays', { days }), urgent: false }
}

export async function AssignmentCard({
  instanceId,
  title,
  deadline,
  status,
  submissionId,
  readOnly = false,
}: AssignmentCardProps) {
  const t = await getTranslations('student.assignments')
  const locale = await getLocale()

  const statusBadge = {
    not_started: <Badge variant="muted">{t('notStarted')}</Badge>,
    in_progress: <Badge variant="warning">{t('inProgress')}</Badge>,
    grading:     <Badge variant="warning">{t('grading')}</Badge>,
    submitted:   <Badge variant="success">{t('submitted')}</Badge>,
    expired:     <Badge variant="error">{t('expired')}</Badge>,
  }[status]

  const { text, countdown, urgent } = formatDeadline(deadline, locale, t)
  const isExpired = new Date(deadline) < new Date()
  const canStart = !readOnly && !isExpired && (status === 'not_started' || status === 'in_progress')

  return (
    <div className={[
      'group flex flex-col gap-4 rounded-[22px] border bg-gradient-to-br p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100 sm:flex-row sm:items-center',
      statusTone(status),
    ].join(' ')}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#5368f6] shadow-sm transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h10l3 3v13H4V4h3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="truncate text-base font-black text-ink">{title}</p>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className={urgent ? 'font-bold text-[#e25555]' : 'font-bold text-[#5368f6]'}>
            {countdown}
          </span>
          <span className="text-[#c0c5d2]">·</span>
          <span className="font-medium text-[#747b8f]">{text}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {statusBadge}
        {canStart && (
          <Link
            href={`/student/test/${instanceId}`}
            className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#4f7cff] to-[#7c4dff] px-5 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-105"
          >
            {status === 'in_progress' ? t('continueAssignment') : t('startAssignment')}
          </Link>
        )}
        {isExpired && status === 'in_progress' && (
          <div className="flex items-center gap-1.5 rounded-full border border-[#ffd4dc] bg-[#fff0f2] px-4 py-2 text-xs font-bold text-[#c0394b]">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            {t('waitExtension')}
          </div>
        )}
        {status === 'submitted' && submissionId && (
          <Link
            href={`/student/test/${instanceId}/results`}
            className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-black text-ink shadow-sm transition-transform hover:scale-105"
          >
            {t('viewResults')}
          </Link>
        )}
        {readOnly && status !== 'submitted' && (
          <span className="text-sm font-medium text-mute-light">{t('reviewOnly')}</span>
        )}
      </div>
    </div>
  )
}

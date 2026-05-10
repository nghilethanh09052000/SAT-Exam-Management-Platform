import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { SubmissionStatus } from '@/types'

interface AssignmentCardProps {
  instanceId: string
  title: string
  deadline: string
  status: SubmissionStatus | 'not_started'
  submissionId?: string
}

function getStatusBadge(status: AssignmentCardProps['status']) {
  switch (status) {
    case 'not_started':
      return <Badge variant="muted">Chưa làm</Badge>
    case 'in_progress':
      return <Badge variant="warning">Đang làm</Badge>
    case 'submitted':
      return <Badge variant="success">Đã nộp</Badge>
    case 'expired':
      return <Badge variant="error">Hết hạn</Badge>
  }
}

function formatDeadline(deadline: string) {
  const d = new Date(deadline)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  const formatted = d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (diff < 0) return { text: formatted, countdown: 'Đã hết hạn', urgent: true }
  if (days === 0) return { text: formatted, countdown: 'Hôm nay', urgent: true }
  if (days === 1) return { text: formatted, countdown: 'Còn 1 ngày', urgent: true }
  return { text: formatted, countdown: `Còn ${days} ngày`, urgent: false }
}

export function AssignmentCard({
  instanceId,
  title,
  deadline,
  status,
  submissionId,
}: AssignmentCardProps) {
  const { text, countdown, urgent } = formatDeadline(deadline)
  const canStart = status === 'not_started' || status === 'in_progress'

  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-surface-card rounded-card hover:bg-surface-soft transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-ink truncate">{title}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className={urgent ? 'text-warning font-medium' : 'text-mute-light'}>
            {countdown}
          </span>
          <span className="text-ash-light">·</span>
          <span className="text-mute-light">{text}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {getStatusBadge(status)}
        {canStart && (
          <Link
            href={`/student/test/${instanceId}`}
            className="h-9 px-4 bg-primary hover:bg-primary-pressed text-white text-sm font-medium rounded-full inline-flex items-center transition-colors"
          >
            {status === 'in_progress' ? 'Tiếp tục' : 'Bắt đầu làm'}
          </Link>
        )}
        {status === 'submitted' && submissionId && (
          <Link
            href={`/student/test/${instanceId}/results`}
            className="h-9 px-4 bg-surface-soft hover:bg-ash-light text-ink text-sm font-medium rounded-full inline-flex items-center transition-colors"
          >
            Xem kết quả
          </Link>
        )}
      </div>
    </div>
  )
}

import { createServerClient } from '@/lib/supabase/server'
import { AssignmentCard } from '@/components/dashboard/assignment-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { SubmissionStatus } from '@/types'

export default async function StudentHomePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get student enrollments
  const enrollmentsResult = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('student_id', user.id)

  type EnrollRow = { class_id: string }
  const enrollments: EnrollRow[] = (enrollmentsResult.data as EnrollRow[] | null) ?? []
  const classIds = enrollments.map((e) => e.class_id)

  // Get assignment instances for enrolled classes
  type InstanceRow = {
    id: string
    deadline: string
    published_at: string | null
    class_id: string
    assignment_id: string
    assignments: { title: string } | null
  }

  const instancesResult = classIds.length > 0
    ? await supabase
        .from('assignment_instances')
        .select('id, deadline, published_at, class_id, assignment_id, assignments(title)')
        .in('class_id', classIds)
        .not('published_at', 'is', null)
        .order('deadline', { ascending: true })
    : { data: [] as InstanceRow[] }

  const instances: InstanceRow[] = (instancesResult.data as InstanceRow[] | null) ?? []

  // Get student's submissions
  const instanceIds = instances.map((i) => i.id)

  type SubRow = { id: string; instance_id: string; status: string }
  const subsResult = instanceIds.length > 0
    ? await supabase
        .from('submissions')
        .select('id, instance_id, status')
        .eq('student_id', user.id)
        .in('instance_id', instanceIds)
        .order('started_at', { ascending: false })
    : { data: [] as SubRow[] }

  const submissions: SubRow[] = (subsResult.data as SubRow[] | null) ?? []

  // Build a map: instance_id → latest submission
  const submissionMap: Record<string, { id: string; status: SubmissionStatus }> = {}
  for (const s of submissions) {
    if (!submissionMap[s.instance_id]) {
      submissionMap[s.instance_id] = { id: s.id, status: s.status as SubmissionStatus }
    }
  }

  // Build assignment list
  const now = new Date().toISOString()
  const assignments = instances.map((inst) => {
    const sub = submissionMap[inst.id]
    let status: SubmissionStatus | 'not_started'
    if (!sub) {
      status = inst.deadline < now ? 'expired' : 'not_started'
    } else {
      status = sub.status
    }

    return {
      instanceId: inst.id,
      title: inst.assignments?.title ?? '—',
      deadline: inst.deadline,
      status,
      submissionId: sub?.id,
    }
  })

  const activeAssignments = assignments.filter(
    (a) => a.status !== 'expired' && a.status !== 'submitted'
  )
  const pastAssignments = assignments.filter(
    (a) => a.status === 'expired' || a.status === 'submitted'
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-ink mb-1">
          Bài tập của bạn
        </h1>
        <p className="text-sm text-mute-light">
          Xem và hoàn thành các bài tập được giao
        </p>
      </div>

      {/* Active assignments */}
      <section>
        <h2 className="text-base font-display font-semibold text-ink mb-3">
          Đang mở ({activeAssignments.length})
        </h2>
        {activeAssignments.length === 0 ? (
          <EmptyState
            title="Không có bài tập nào đang mở"
            description="Các bài tập mới sẽ hiển thị tại đây khi giáo viên xuất bản"
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
        ) : (
          <div className="space-y-2">
            {activeAssignments.map((a) => (
              <AssignmentCard key={a.instanceId} {...a} />
            ))}
          </div>
        )}
      </section>

      {/* Past assignments */}
      {pastAssignments.length > 0 && (
        <section>
          <h2 className="text-base font-display font-semibold text-ink mb-3">
            Đã qua ({pastAssignments.length})
          </h2>
          <div className="space-y-2">
            {pastAssignments.map((a) => (
              <AssignmentCard key={a.instanceId} {...a} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

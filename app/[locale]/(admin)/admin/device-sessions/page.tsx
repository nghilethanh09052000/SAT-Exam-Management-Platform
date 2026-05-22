import { PageHeader } from '@/components/ui/page-header'
import { createServerClient } from '@/lib/supabase/server'
import { DeviceSessionsClient, type DeviceSessionRow } from './device-sessions-client'

export default async function DeviceSessionsPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('device_sessions')
    .select('id, user_id, session_token, device_info, logged_in_at, last_active_at, is_violation, profiles(full_name, role)')
    .order('is_violation', { ascending: false })
    .order('last_active_at', { ascending: false })
    .limit(100)

  const sessions = ((data ?? []) as unknown as DeviceSessionRow[])
  const violationCount = sessions.filter((session) => session.is_violation).length
  const staffCount = sessions.filter((session) => {
    const role = session.profiles?.role
    return role === 'admin' || role === 'teacher'
  }).length
  const activeToday = sessions.filter((session) => {
    const lastActive = new Date(session.last_active_at).getTime()
    return Date.now() - lastActive < 24 * 60 * 60 * 1000
  }).length

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Giám sát thiết bị"
        description="Theo dõi phiên đăng nhập, xóa phiên cũ để học sinh chuyển sang thiết bị mới"
        breadcrumbs={[{ label: 'Giám sát thiết bị' }]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-card border border-white/70 bg-white/85 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Phiên có vi phạm</p>
          <p className="mt-2 text-3xl font-black text-rose-600">{violationCount}</p>
        </div>
        <div className="rounded-card border border-white/70 bg-white/85 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Phiên admin/giáo viên</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{staffCount}</p>
        </div>
        <div className="rounded-card border border-white/70 bg-white/85 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Hoạt động trong 24h</p>
          <p className="mt-2 text-3xl font-black text-emerald-600">{activeToday}</p>
        </div>
      </div>

      <DeviceSessionsClient sessions={sessions} />
    </div>
  )
}

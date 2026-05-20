import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { createServerClient } from '@/lib/supabase/server'

type DeviceSessionRow = {
  id: string
  user_id: string
  session_token: string
  device_info: string | null
  logged_in_at: string
  last_active_at: string
  is_violation: boolean
  profiles: {
    full_name: string
    role: 'admin' | 'teacher' | 'student'
  } | null
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function roleLabel(role: NonNullable<DeviceSessionRow['profiles']>['role'] | undefined) {
  if (role === 'admin') return 'Admin'
  if (role === 'teacher') return 'Giáo viên'
  if (role === 'student') return 'Học sinh'
  return 'Không rõ'
}

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
        description="Theo dõi phiên đăng nhập gần đây và các phiên bị đánh dấu vi phạm"
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

      <div className="overflow-hidden rounded-card border border-white/70 bg-white/90 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">100 phiên gần nhất</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Người dùng</th>
                <th className="px-5 py-3">Vai trò</th>
                <th className="px-5 py-3">Thiết bị</th>
                <th className="px-5 py-3">Đăng nhập</th>
                <th className="px-5 py-3">Hoạt động cuối</th>
                <th className="px-5 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <tr key={session.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-950">{session.profiles?.full_name ?? 'Không rõ'}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{session.user_id}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{roleLabel(session.profiles?.role)}</td>
                  <td className="max-w-sm px-5 py-4 text-slate-600">
                    <p className="line-clamp-2">{session.device_info ?? 'Chưa có thông tin thiết bị'}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDateTime(session.logged_in_at)}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDateTime(session.last_active_at)}</td>
                  <td className="px-5 py-4">
                    <Badge variant={session.is_violation ? 'error' : 'success'}>
                      {session.is_violation ? 'Vi phạm' : 'Bình thường'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm font-medium text-slate-500">
                    Chưa có phiên thiết bị nào được ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

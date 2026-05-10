import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'

interface ProfileRow {
  full_name: string
  phone: string | null
  role: string
}

export default async function TeacherSettingsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, phone, role')
    .eq('id', user?.id ?? '')
    .single()

  const profile = profileResult.data as ProfileRow | null

  return (
    <div className="max-w-lg">
      <PageHeader
        title="Cài đặt"
        description="Thông tin tài khoản của bạn"
      />
      <Card className="p-6 space-y-4">
        <div>
          <p className="text-sm text-mute-light">Họ tên</p>
          <p className="font-medium text-ink">{profile?.full_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm text-mute-light">Email</p>
          <p className="font-medium text-ink">{user?.email ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm text-mute-light">Số điện thoại</p>
          <p className="font-medium text-ink">{profile?.phone ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm text-mute-light">Vai trò</p>
          <p className="font-medium text-ink capitalize">{profile?.role ?? '—'}</p>
        </div>
      </Card>
    </div>
  )
}

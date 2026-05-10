import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { AdminStudentsClient } from './students-client'

export default async function AdminStudentsPage() {
  const supabase = createServerClient()

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, phone, is_active, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false })

  return (
    <div>
      <PageHeader
        title="Học sinh"
        description="Quản lý tài khoản học sinh"
      />
      <AdminStudentsClient students={students ?? []} />
    </div>
  )
}

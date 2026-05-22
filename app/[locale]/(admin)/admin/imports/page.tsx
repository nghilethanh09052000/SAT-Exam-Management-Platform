import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { createServiceClient } from '@/lib/import-files'
import type { FileImportStatus, SourceFileType } from '@/types/database'

type ImportRow = {
  id: string
  uploaded_by: string
  original_filename: string
  storage_bucket: string
  storage_path: string
  file_type: SourceFileType
  import_type: string
  total_records: number
  success_count: number
  failure_count: number
  status: FileImportStatus
  error_message: string | null
  created_at: string
  profiles: { full_name: string } | null
}

type ImportViewRow = ImportRow & {
  signedUrl: string | null
}

const statusLabels: Record<FileImportStatus, string> = {
  processing: 'Đang xử lý',
  parsed: 'Đã phân tích',
  success: 'Thành công',
  partial_success: 'Một phần',
  failed: 'Thất bại',
}

const statusVariants: Record<FileImportStatus, 'success' | 'warning' | 'error' | 'info'> = {
  processing: 'info',
  parsed: 'info',
  success: 'success',
  partial_success: 'warning',
  failed: 'error',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatType(fileType: SourceFileType) {
  return fileType === 'docx' ? 'DOCX' : 'PDF'
}

export default async function AdminImportsPage() {
  const supabase = createServerClient()
  const raw = createServiceClient()

  const { data } = await supabase
    .from('file_imports')
    .select('id, uploaded_by, original_filename, storage_bucket, storage_path, file_type, import_type, total_records, success_count, failure_count, status, error_message, created_at, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const imports = (data as ImportRow[] | null) ?? []
  const rows: ImportViewRow[] = await Promise.all(
    imports.map(async (item) => {
      const { data: signed } = await raw.storage
        .from(item.storage_bucket)
        .createSignedUrl(item.storage_path, 60 * 60)

      return {
        ...item,
        signedUrl: signed?.signedUrl ?? null,
      }
    })
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Tệp tải lên"
        description="Theo dõi file DOCX/PDF gốc đã được lưu vào Supabase Storage"
        breadcrumbs={[{ label: 'Tệp tải lên' }]}
      />

      <div className="overflow-hidden rounded-card border border-hairline-light bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Tên file</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Người tạo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Số bản ghi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Thành công</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Không thành công</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">Ngày tải</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light bg-canvas-light">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-mute-light">
                    Chưa có file tải lên
                  </td>
                </tr>
              ) : (
                rows.map((item, index) => (
                  <tr key={item.id} className="transition-colors hover:bg-surface-soft">
                    <td className="px-4 py-3 text-ink">{index + 1}</td>
                    <td className="max-w-[280px] px-4 py-3">
                      {item.signedUrl ? (
                        <Link href={item.signedUrl} className="font-medium text-primary hover:underline" target="_blank">
                          <span className="block truncate">{item.original_filename}</span>
                        </Link>
                      ) : (
                        <span className="block truncate text-ink">{item.original_filename}</span>
                      )}
                      <span className="mt-1 block truncate text-xs text-mute-light">{item.storage_path}</span>
                    </td>
                    <td className="px-4 py-3 text-ink">{item.profiles?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-ink">{formatType(item.file_type)}</td>
                    <td className="px-4 py-3 text-ink">{item.total_records}</td>
                    <td className="px-4 py-3 text-ink">{item.success_count}</td>
                    <td className="px-4 py-3 text-ink">{item.failure_count}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariants[item.status]} title={item.error_message ?? undefined}>
                        {statusLabels[item.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-mute-light">{formatDate(item.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

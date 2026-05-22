import { Link } from '@/i18n/navigation'
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server'
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

function getStatusLabels(t: (key: string) => string): Record<FileImportStatus, string> {
  return {
    processing: t('statusProcessing'),
    parsed: t('statusParsed'),
    success: t('statusSuccess'),
    partial_success: t('statusPartial'),
    failed: t('statusFailed'),
  }
}

const statusVariants: Record<FileImportStatus, 'success' | 'warning' | 'error' | 'info'> = {
  processing: 'info',
  parsed: 'info',
  success: 'success',
  partial_success: 'warning',
  failed: 'error',
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatType(fileType: SourceFileType) {
  return fileType === 'docx' ? 'DOCX' : 'PDF'
}

export default async function AdminImportsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('admin.imports')
  const locale = await getLocale()
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

  const statusLabels = getStatusLabels(t)

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={[{ label: t('title') }]}
      />

      <div className="overflow-hidden rounded-card border border-hairline-light bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-light bg-surface-soft">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colId')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colFilename')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colCreator')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colType')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colTotal')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colSuccess')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colFailed')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mute-light">{t('colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light bg-canvas-light">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-mute-light">
                    {t('noFiles')}
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
                    <td className="whitespace-nowrap px-4 py-3 text-mute-light">{formatDate(item.created_at, locale)}</td>
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

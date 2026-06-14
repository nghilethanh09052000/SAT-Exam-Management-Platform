import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type AuditRow = {
  id: number
  actor_id: string
  target_id: string
  action: 'grant' | 'revoke' | 'assign_class' | 'unassign_class' | string
  detail: string
  created_at: string
}

const ACTION_BADGE: Record<string, string> = {
  grant: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  revoke: 'border-rose-200 bg-rose-50 text-rose-700',
  assign_class: 'border-blue-200 bg-blue-50 text-blue-700',
  unassign_class: 'border-amber-200 bg-amber-50 text-amber-700',
}

export default async function AdminAuditPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('admin.audit')
  const db = serviceClient()

  const { data: rawRows } = await db
    .from('permission_audit')
    .select('id, actor_id, target_id, action, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (rawRows ?? []) as AuditRow[]

  // Resolve actor/target names and class titles in bulk (avoids ambiguous FK embeds).
  const profileIds = Array.from(new Set(rows.flatMap((r) => [r.actor_id, r.target_id])))
  const classIds = Array.from(
    new Set(rows.filter((r) => r.action === 'assign_class' || r.action === 'unassign_class').map((r) => r.detail))
  )

  const [{ data: profs }, { data: classRows }] = await Promise.all([
    profileIds.length
      ? db.from('profiles').select('id, full_name').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    classIds.length
      ? db.from('classes').select('id, title').in('id', classIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  const nameById = new Map(((profs ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))
  const classById = new Map(((classRows ?? []) as { id: string; title: string }[]).map((c) => [c.id, c.title]))

  const dateLocale = params.locale === 'vi' ? 'vi-VN' : 'en-US'
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    })

  const actionLabel = (action: string) =>
    ({ grant: t('actionGrant'), revoke: t('actionRevoke'), assign_class: t('actionAssign'), unassign_class: t('actionUnassign') } as Record<string, string>)[action] ?? action

  const detailLabel = (r: AuditRow) =>
    r.action === 'assign_class' || r.action === 'unassign_class' ? (classById.get(r.detail) ?? r.detail) : r.detail

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={t('title')} description={t('description')} breadcrumbs={[{ label: t('title') }]} />

      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm font-medium text-mute-light">{t('empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">{t('colWhen')}</th>
                  <th className="px-5 py-3">{t('colActor')}</th>
                  <th className="px-5 py-3">{t('colAction')}</th>
                  <th className="px-5 py-3">{t('colDetail')}</th>
                  <th className="px-5 py-3">{t('colTarget')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3 text-xs font-medium text-mute-light tabular-nums">{fmt(r.created_at)}</td>
                    <td className="px-5 py-3 font-medium text-ink">{nameById.get(r.actor_id) ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${ACTION_BADGE[r.action] ?? 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {actionLabel(r.action)}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{detailLabel(r)}</td>
                    <td className="px-5 py-3 font-medium text-ink">{nameById.get(r.target_id) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

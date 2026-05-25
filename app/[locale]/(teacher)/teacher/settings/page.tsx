import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface ProfileRow {
  full_name: string
  phone: string | null
  role: string
}

export default async function TeacherSettingsPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('teacher.settings')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profileResult = await supabase
    .from('profiles')
    .select('full_name, phone, role')
    .eq('id', user?.id ?? '')
    .single()

  const profile = profileResult.data as ProfileRow | null

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('title')}
        description={t('manage')}
      />
      <Card className="relative overflow-hidden border border-white/70 bg-white p-6 shadow-sm animate-fade-up">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white shadow-lg shadow-indigo-500/20">
            {(profile?.full_name ?? user?.email ?? 'T')[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{profile?.full_name ?? '—'}</h2>
            <p className="text-sm text-mute-light">{user?.email ?? '—'}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            [t('fullName'), profile?.full_name ?? '—'],
            ['Email', user?.email ?? '—'],
            [t('phone'), profile?.phone ?? '—'],
            [t('role'), profile?.role ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-mute-light">{label}</p>
              <p className="mt-2 font-medium text-ink">{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

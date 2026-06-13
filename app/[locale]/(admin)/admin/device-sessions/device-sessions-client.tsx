'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type DeviceSessionRow = {
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

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function DeviceSessionsClient({ sessions }: { sessions: DeviceSessionRow[] }) {
  const router = useRouter()
  const t = useTranslations('admin.deviceSessions')
  const locale = useLocale()
  const [clearingUserId, setClearingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionCountsByUser = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of sessions) {
      counts.set(session.user_id, (counts.get(session.user_id) ?? 0) + 1)
    }
    return counts
  }, [sessions])

  async function clearSessions(userId: string, fullName: string) {
    if (!window.confirm(t('confirmDelete', { name: fullName }))) {
      return
    }

    setClearingUserId(userId)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/device-sessions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('errorDelete'))
      setMessage(t('successDelete', { count: json.data?.cleared ?? 0, name: fullName }))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorDelete'))
    } finally {
      setClearingUserId(null)
    }
  }

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div
          className={[
            'rounded-card border px-4 py-3 text-sm font-semibold',
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {error ?? message}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-white/70 bg-white/90 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-ink">{t('recentTitle')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">{t('colUser')}</th>
                <th className="px-5 py-3">{t('colRole')}</th>
                <th className="px-5 py-3">{t('colDevice')}</th>
                <th className="px-5 py-3">{t('colLogin')}</th>
                <th className="px-5 py-3">{t('colLastActive')}</th>
                <th className="px-5 py-3">{t('colStatus')}</th>
                <th className="px-5 py-3">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => {
                const fullName = session.profiles?.full_name ?? t('unknownUser')
                const role = session.profiles?.role
                const roleText = role === 'admin' ? 'Admin' : role === 'teacher' ? t('roleTeacher') : role === 'student' ? t('roleStudent') : t('roleUnknown')
                return (
                  <tr key={session.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-ink">{fullName}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{session.user_id}</p>
                      {(sessionCountsByUser.get(session.user_id) ?? 0) > 1 && (
                        <p className="mt-1 text-xs font-semibold text-amber-600">
                          {t('sessionCount', { count: sessionCountsByUser.get(session.user_id) ?? 0 })}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{roleText}</td>
                    <td className="max-w-sm px-5 py-4 text-slate-600">
                      <p className="line-clamp-2">{session.device_info ?? t('noDevice')}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(session.logged_in_at, locale)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(session.last_active_at, locale)}</td>
                    <td className="px-5 py-4">
                      <Badge variant={session.is_violation ? 'error' : 'success'}>
                        {session.is_violation ? t('statusViolation') : t('statusNormal')}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={clearingUserId === session.user_id}
                        onClick={() => clearSessions(session.user_id, fullName)}
                      >
                        {t('deleteSession')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-500">
                    {t('noSessions')}
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

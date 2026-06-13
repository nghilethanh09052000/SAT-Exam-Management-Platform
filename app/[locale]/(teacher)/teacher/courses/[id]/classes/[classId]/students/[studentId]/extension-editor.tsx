'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

/** Datetime-local value in VN time for an ISO string, for input prefill. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function ExtensionEditor({
  instanceId,
  studentId,
  currentExtension,
}: {
  instanceId: string
  studentId: string
  currentExtension: string | null
}) {
  const t = useTranslations('teacher.studentReport')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(toLocalInput(currentExtension))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/assignment-extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: instanceId,
          student_id: studentId,
          // datetime-local has no zone; the teacher thinks in VN time
          extended_deadline: new Date(`${value}:00+07:00`).toISOString(),
        }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/assignment-extensions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId, student_id: studentId }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setValue('')
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-navy-tint print:hidden"
      >
        {currentExtension ? t('editExtension') : t('grantExtension')}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 rounded-lg border border-ash-light bg-white px-2 text-xs text-ink outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !value}
        className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navy-soft disabled:opacity-60"
      >
        {t('saveExtension')}
      </button>
      {currentExtension && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="rounded-full px-2 py-1 text-xs font-semibold text-warning hover:bg-red-50 disabled:opacity-60"
        >
          {t('removeExtension')}
        </button>
      )}
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null) }}
        className="rounded-full px-2 py-1 text-xs font-semibold text-mute-light hover:bg-surface-soft"
      >
        {t('cancel')}
      </button>
      {error && <span className="text-xs font-semibold text-warning">{error}</span>}
    </div>
  )
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-ash-light bg-white px-4 text-sm font-semibold text-ink hover:bg-surface-soft print:hidden"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-3h12v7H6v-7z" />
      </svg>
      {label}
    </button>
  )
}

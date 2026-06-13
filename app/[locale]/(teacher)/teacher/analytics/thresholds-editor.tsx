'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const inputCls =
  'h-9 w-20 rounded-lg border border-ash-light bg-white px-2 text-center text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function ThresholdsEditor({
  initial,
}: {
  initial: { excellent_pct: number; target_pct: number; watch_pct: number }
}) {
  const t = useTranslations('teacher.analytics')
  const router = useRouter()
  const [excellent, setExcellent] = useState(String(initial.excellent_pct))
  const [target, setTarget] = useState(String(initial.target_pct))
  const [watch, setWatch] = useState(String(initial.watch_pct))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    const e = Number(excellent)
    const tg = Number(target)
    const w = Number(watch)
    if (!(e >= tg && tg >= w)) {
      setError(t('thresholdOrderError'))
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/performance-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excellent_pct: e, target_pct: tg, watch_pct: w }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      setSaved(true)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-hairline-light bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-ink">{t('thresholdsTitle')}</p>
      <p className="mt-0.5 text-xs text-mute-light">{t('thresholdsDesc')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="font-medium text-mute-light">{t('tierExcellent')} ≥</span>
          <input type="number" min="0" max="100" value={excellent} onChange={(e) => setExcellent(e.target.value)} className={inputCls} />%
        </label>
        <label className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
          <span className="font-medium text-mute-light">{t('tierTarget')} ≥</span>
          <input type="number" min="0" max="100" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />%
        </label>
        <label className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span className="font-medium text-mute-light">{t('tierWatch')} ≥</span>
          <input type="number" min="0" max="100" value={watch} onChange={(e) => setWatch(e.target.value)} className={inputCls} />%
        </label>
        <span className="flex items-center gap-2 text-mute-light">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="font-medium">{t('tierDanger')}: {t('tierDangerDesc')}</span>
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="h-9 rounded-xl bg-navy px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-soft disabled:opacity-60"
        >
          {saving ? t('saving') : t('saveThresholds')}
        </button>
        {saved && <span className="text-xs font-bold text-emerald-600">{t('thresholdsSaved')}</span>}
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-warning">{error}</p>}
    </div>
  )
}

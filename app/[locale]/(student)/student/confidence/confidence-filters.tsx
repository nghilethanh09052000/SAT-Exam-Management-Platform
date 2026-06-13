'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

const selectCls =
  'h-10 rounded-xl border border-[#e4e9f5] bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-[#5368f6] focus:ring-2 focus:ring-[#5368f6]/15'

export function ConfidenceFilters({
  skills,
  sets,
  level,
  skill,
  set,
  from,
  to,
}: {
  skills: { id: string; name: string }[]
  sets: { id: string; title: string }[]
  level: string
  skill: string
  set: string
  from: string
  to: string
}) {
  const t = useTranslations('student.confidence')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-sm shadow-blue-100/50">
      <div>
        <label className="mb-1 block text-xs font-bold text-[#8a91a3]">{t('filterLevel')}</label>
        <select value={level} onChange={(e) => setParam('level', e.target.value)} className={selectCls}>
          <option value="">{t('allLevels')}</option>
          <option value="high">{t('high')}</option>
          <option value="medium">{t('medium')}</option>
          <option value="low">{t('low')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-[#8a91a3]">{t('filterSkill')}</label>
        <select value={skill} onChange={(e) => setParam('skill', e.target.value)} className={selectCls}>
          <option value="">{t('allSkills')}</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-[#8a91a3]">{t('filterSet')}</label>
        <select value={set} onChange={(e) => setParam('set', e.target.value)} className={selectCls}>
          <option value="">{t('allSets')}</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-[#8a91a3]">{t('filterFrom')}</label>
        <input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className={selectCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-[#8a91a3]">{t('filterTo')}</label>
        <input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className={selectCls} />
      </div>
      {(level || skill || set || from || to) && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="h-10 rounded-xl px-3 text-sm font-bold text-[#5368f6] hover:bg-[#eef3ff]"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  )
}

'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface ClassOption {
  id: string
  title: string
  courseTitle: string
}

interface TagOption {
  id: string
  name: string
}

const selectCls =
  'h-10 rounded-xl border border-ash-light bg-white px-3 text-sm font-medium text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function AnalyticsFilters({
  classes,
  tags,
  selectedClassId,
  selectedTagId,
  from,
  to,
}: {
  classes: ClassOption[]
  tags: TagOption[]
  selectedClassId: string
  selectedTagId: string
  from: string
  to: string
}) {
  const t = useTranslations('teacher.analytics')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // Changing class invalidates the tag filter (tags differ per class data)
    if (key === 'class') params.delete('tag')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-hairline-light bg-white p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-xs font-semibold text-mute-light">{t('filterClass')}</label>
        <select value={selectedClassId} onChange={(e) => setParam('class', e.target.value)} className={selectCls}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.courseTitle} · {c.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-mute-light">{t('filterFrom')}</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setParam('from', e.target.value)}
          className={selectCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-mute-light">{t('filterTo')}</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setParam('to', e.target.value)}
          className={selectCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-mute-light">{t('filterSkill')}</label>
        <select value={selectedTagId} onChange={(e) => setParam('tag', e.target.value)} className={selectCls}>
          <option value="">{t('allSkills')}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
      </div>
      {(from || to || selectedTagId) && (
        <button
          type="button"
          onClick={() => router.push(`${pathname}?class=${selectedClassId}`)}
          className="h-10 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-navy-tint"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  )
}

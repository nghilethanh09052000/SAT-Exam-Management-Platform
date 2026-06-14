'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { Permission } from '@/lib/permissions'

/**
 * Per-staff permission editor.
 *
 * Renders the 14-permission catalog grouped by resource, with a plain-language
 * explanation next to every checkbox so the owner understands what each grant does.
 */

export type { Permission }

export interface ClassOption {
  id: string
  title: string
  courseTitle: string | null
}

type PermDef = { key: Permission; id: string; danger?: boolean }
type GroupDef = { id: string; accent: string; perms: PermDef[] }

// id = i18n-safe key under admin.users.rbac.perms (no colon)
const GROUPS: GroupDef[] = [
  { id: 'materials', accent: 'bg-blue-500', perms: [
    { key: 'materials:view', id: 'materialsView' },
    { key: 'materials:create', id: 'materialsCreate' },
    { key: 'materials:update', id: 'materialsUpdate' },
    { key: 'materials:delete', id: 'materialsDelete', danger: true },
  ] },
  { id: 'questions', accent: 'bg-cyan-500', perms: [
    { key: 'questions:view', id: 'questionsView' },
    { key: 'questions:create', id: 'questionsCreate' },
    { key: 'questions:update', id: 'questionsUpdate' },
    { key: 'questions:delete', id: 'questionsDelete', danger: true },
  ] },
  { id: 'students', accent: 'bg-emerald-500', perms: [
    { key: 'students:view', id: 'studentsView' },
    { key: 'students:create', id: 'studentsCreate' },
    { key: 'students:update', id: 'studentsUpdate' },
    { key: 'students:delete', id: 'studentsDelete', danger: true },
  ] },
  { id: 'performance', accent: 'bg-violet-500', perms: [
    { key: 'performance:view', id: 'performanceView' },
  ] },
  { id: 'classes', accent: 'bg-amber-500', perms: [
    { key: 'classes:create', id: 'classesCreate' },
    { key: 'classes:update', id: 'classesUpdate' },
    { key: 'classes:delete', id: 'classesDelete', danger: true },
  ] },
  { id: 'grading', accent: 'bg-pink-500', perms: [
    { key: 'grading:view', id: 'gradingView' },
    { key: 'grading:update', id: 'gradingUpdate', danger: false },
  ] },
  { id: 'examPapers', accent: 'bg-indigo-500', perms: [
    { key: 'exam_papers:view', id: 'examPapersView' },
    { key: 'exam_papers:create', id: 'examPapersCreate' },
    { key: 'exam_papers:update', id: 'examPapersUpdate' },
    { key: 'exam_papers:delete', id: 'examPapersDelete', danger: true },
  ] },
  { id: 'assignments', accent: 'bg-teal-500', perms: [
    { key: 'assignments:view', id: 'assignmentsView' },
    { key: 'assignments:create', id: 'assignmentsCreate' },
    { key: 'assignments:update', id: 'assignmentsUpdate' },
    { key: 'assignments:delete', id: 'assignmentsDelete', danger: true },
  ] },
]

const PRESETS: Record<'teacher' | 'materials' | 'care', Permission[]> = {
  teacher: ['materials:view', 'materials:create', 'materials:update', 'questions:view', 'questions:create', 'questions:update', 'students:view', 'performance:view', 'grading:view', 'grading:update', 'exam_papers:view', 'exam_papers:create', 'exam_papers:update', 'assignments:view', 'assignments:create', 'assignments:update'],
  materials: ['materials:view', 'materials:create', 'materials:update', 'materials:delete', 'questions:view', 'questions:create', 'questions:update', 'questions:delete', 'exam_papers:view', 'exam_papers:create', 'exam_papers:update', 'exam_papers:delete', 'assignments:view', 'assignments:create', 'assignments:update', 'assignments:delete'],
  care: ['students:view', 'students:create', 'students:update', 'performance:view'],
}

interface Props {
  open: boolean
  onClose: () => void
  staffId: string
  staffName: string
  classes: ClassOption[]
  onSaved?: () => void
}

export function PermissionEditor({
  open,
  onClose,
  staffId,
  staffName,
  classes,
  onSaved,
}: Props) {
  const t = useTranslations('admin.users.rbac')
  const tu = useTranslations('admin.users')
  const [granted, setGranted] = useState<Set<Permission>>(new Set())
  const [classIds, setClassIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/admin/users/${staffId}/permissions`)
      .then(async (res) => {
        const json = await res.json() as { data?: { permissions: Permission[]; class_ids: string[] } | null; error?: string | null }
        if (!res.ok || !json.data) throw new Error(json.error ?? t('loadError'))
        if (cancelled) return
        setGranted(new Set(json.data.permissions))
        setClassIds(new Set(json.data.class_ids))
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || t('loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, staffId, t])

  function toggle(perm: Permission) {
    setGranted((prev) => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm)
      else next.add(perm)
      return next
    })
  }

  function toggleClass(id: string) {
    setClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applyPreset(preset: keyof typeof PRESETS) {
    setGranted(new Set(PRESETS[preset]))
  }

  const selectedClassTitles = useMemo(
    () => classes.filter((c) => classIds.has(c.id)).map((c) => c.title),
    [classes, classIds]
  )

  const effective = useMemo(() => {
    const labels = GROUPS.flatMap((g) => g.perms)
      .filter((p) => granted.has(p.key))
      .map((p) => t(`perms.${p.id}.label`).toLowerCase())
    if (labels.length === 0) return t('effectiveNone')
    const scope = selectedClassTitles.length
      ? t('effectiveInClasses', { classes: selectedClassTitles.join(', ') })
      : t('effectiveNoClass')
    return `${t('effectivePrefix')} ${labels.join(', ')} ${scope}`
  }, [granted, selectedClassTitles, t])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${staffId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: Array.from(granted),
          class_ids: Array.from(classIds),
        }),
      })
      const json = await response.json() as { error?: string | null }
      if (!response.ok || json.error) {
        setError(json.error ?? t('saveError'))
        return
      }
      onSaved?.()
      onClose()
    } catch {
      setError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={t('title', { name: staffName })} onClose={onClose} size="xl">
      <div className="space-y-5">
        {/* Cross-cutting rules */}
        <div className="space-y-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-blue-800">
            <span aria-hidden className="mt-0.5">👑</span>{t('ownerBanner')}
          </p>
          <p className="flex items-start gap-2 text-sm font-medium text-blue-800">
            <span aria-hidden className="mt-0.5">🔒</span>{t('scopeBanner')}
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
            {error}
          </p>
        )}

        {/* Presets */}
        <div className={`flex flex-wrap items-center gap-2 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <span className="text-xs font-black uppercase tracking-wide text-slate-400">{t('presetLabel')}</span>
          {(['teacher', 'materials', 'care'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100"
            >
              {t(`preset${preset === 'teacher' ? 'Teacher' : preset === 'materials' ? 'Materials' : 'Care'}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setGranted(new Set())}
            className="ml-auto rounded-full px-3 py-1.5 text-sm font-bold text-slate-400 transition-all hover:text-slate-600"
          >
            {t('clearAll')}
          </button>
        </div>

        {/* Class assignment */}
        <div className={`rounded-2xl border border-slate-100 bg-white p-4 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <p className="text-sm font-black text-ink">{t('classesLabel')}</p>
          <p className="mb-3 text-xs font-medium text-mute-light">{t('classesHint')}</p>
          {classes.length === 0 ? (
            <p className="text-sm font-medium text-mute-light">{t('noClassesYet')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => {
                const active = classIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    {active ? '✓ ' : '+ '}{c.title}
                    {c.courseTitle ? <span className="font-medium opacity-60"> · {c.courseTitle}</span> : null}
                  </button>
                )
              })}
            </div>
          )}
          {granted.size > 0 && classIds.size === 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              {t('noClassesWarning')}
            </p>
          )}
        </div>

        {/* Permission grid */}
        <div className={`space-y-3 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          {GROUPS.map((group) => (
            <div key={group.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${group.accent}`} aria-hidden />
                <span className="text-sm font-black text-ink">{t(`groups.${group.id}`)}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {group.perms.map((perm) => {
                  const checked = granted.has(perm.key)
                  return (
                    <label key={perm.key} className="flex cursor-pointer items-start gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(perm.key)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${perm.danger ? 'text-red-600' : 'text-ink'}`}>
                          {t(`perms.${perm.id}.label`)}
                          {perm.danger && <span aria-hidden className="ml-1">⚠</span>}
                        </p>
                        <p className="text-xs font-medium leading-snug text-mute-light">{t(`perms.${perm.id}.desc`)}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Effective access summary */}
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-800">
          <span aria-hidden className="mt-0.5">👁</span>
          <span>{effective}</span>
        </div>

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          {loading ? t('loading') : t('savedHint')}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{tu('cancel')}</Button>
          <Button type="button" onClick={handleSave} loading={saving} disabled={loading}>{t('save')}</Button>
        </div>
      </div>
    </Modal>
  )
}

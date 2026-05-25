'use client'

import { useState, useRef } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import {
  parseStudentCSV,
  downloadStudentTemplate,
  PREVIEW_COLS,
  type ParsedStudentRow,
} from '@/lib/utils/parse-csv'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Week {
  id: string
  title: string
  order: number
}

interface Instance {
  id: string
  week_id: string
  deadline: string
  published_at: string | null
  title: string
}

interface StudentProfile {
  id: string
  full_name: string
  phone: string | null
  is_active: boolean
  birth_year: number | null
  gender: string | null
  school: string | null
  city: string | null
  facebook_url: string | null
  threads_url: string | null
  hobbies: string | null
  target_score: number | null
  source: string | null
}

interface Enrollment {
  id: string
  student_id: string
  enrolled_at: string
  profiles: StudentProfile | null
}

interface ClassDetailClientProps {
  classId: string
  courseId: string
  weeks: Week[]
  instances: Instance[]
  enrollments: Enrollment[]
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'weeks' | 'students'
type AddStudentMode = 'manual' | 'existing'

type ManualStudentForm = {
  full_name: string
  email: string
  phone: string
  birth_year: string
  gender: string
  school: string
  city: string
  facebook_url: string
  threads_url: string
  hobbies: string
  target_score: string
  source: string
}

const emptyManualStudent: ManualStudentForm = {
  full_name: '',
  email: '',
  phone: '',
  birth_year: '',
  gender: '',
  school: '',
  city: '',
  facebook_url: '',
  threads_url: '',
  hobbies: '',
  target_score: '',
  source: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClassDetailClient({
  classId,
  weeks: initialWeeks,
  instances: initialInstances,
  enrollments: initialEnrollments,
}: ClassDetailClientProps) {
  const t = useTranslations('teacher.classDetail')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const dateLocale = locale === 'vi' ? 'vi-VN' : 'en-US'
  const [activeTab, setActiveTab] = useState<Tab>('weeks')
  const [weeks, setWeeks] = useState(initialWeeks)
  const [instances] = useState(initialInstances)
  const [enrollments, setEnrollments] = useState(initialEnrollments)

  // Week tab state
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())
  const [addingWeek, setAddingWeek] = useState(false)
  const [newWeekTitle, setNewWeekTitle] = useState('')
  const [weekLoading, setWeekLoading] = useState(false)

  // Students tab state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState<AddStudentMode>('manual')
  const [studentSearch, setStudentSearch] = useState('')
  const [addIdentifier, setAddIdentifier] = useState('')
  const [manualStudent, setManualStudent] = useState<ManualStudentForm>(emptyManualStudent)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null)

  // CSV import state
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvPreviewRows, setCsvPreviewRows]   = useState<ParsedStudentRow[] | null>(null)
  const [csvImporting, setCsvImporting]       = useState(false)
  const [csvParseError, setCsvParseError]     = useState<string | null>(null)
  const [csvImportResult, setCsvImportResult] = useState<{
    created: number; enrolled: number; skipped: number
    errors: {
      type?: string
      email?: string
      row?: number | null
      field?: string
      path?: Array<string | number>
      code?: string
      message?: string
      error: string
    }[]
  } | null>(null)

  type StudentImportResult = NonNullable<typeof csvImportResult>

  async function waitForStudentImport(importId: string) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const res = await fetch(`/api/student-imports/${importId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error ?? t('errImportCheck'))
      }

      const status = json.data as {
        status: 'processing' | 'success' | 'partial_success' | 'failed'
        result: StudentImportResult | null
        error_message: string | null
      }
      if (['success', 'partial_success', 'failed'].includes(status.status)) return status
      await new Promise((resolve) => setTimeout(resolve, attempt < 15 ? 2000 : 5000))
    }
    throw new Error(t('errImportPending'))
  }

  // ── Week helpers ──────────────────────────────────────────────────────────

  function toggleWeek(id: string) {
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createWeek() {
    if (!newWeekTitle.trim()) return
    setWeekLoading(true)
    try {
      const res = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          title: newWeekTitle.trim(),
          order: weeks.length + 1,
        }),
      })
      const json = await res.json()
      if (!json.error) {
        setWeeks((prev) => [...prev, json.data])
        setNewWeekTitle('')
        setAddingWeek(false)
      }
    } finally {
      setWeekLoading(false)
    }
  }

  // ── Enrollment helpers ────────────────────────────────────────────────────

  function resetAddModal() {
    setShowAddModal(false)
    setAddMode('manual')
    setAddIdentifier('')
    setManualStudent(emptyManualStudent)
    setAddError(null)
    setAddSuccess(null)
  }

  function updateManualStudent(field: keyof ManualStudentForm, value: string) {
    setManualStudent((prev) => ({ ...prev, [field]: value }))
  }

  async function refreshEnrollments() {
    const refreshRes = await fetch(`/api/enrollments?class_id=${classId}`)
    const refreshJson = await refreshRes.json()
    if (!refreshJson.error) setEnrollments(refreshJson.data)
  }

  function parseOptionalNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  async function addManualStudent() {
    const fullName = manualStudent.full_name.trim()
    const email = manualStudent.email.trim().toLowerCase()
    const birthYear = parseOptionalNumber(manualStudent.birth_year)
    const targetScore = parseOptionalNumber(manualStudent.target_score)

    setAddError(null)
    setAddSuccess(null)

    if (!fullName) { setAddError(t('errNoName')); return }
    if (!email) { setAddError(t('errNoEmail')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAddError(t('errInvalidEmail')); return }
    if (Number.isNaN(birthYear)) { setAddError(t('errBirthYear')); return }
    if (Number.isNaN(targetScore)) { setAddError(t('errTargetScore')); return }

    setAddLoading(true)
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          students: [{
            full_name: fullName,
            email,
            phone: manualStudent.phone.trim() || null,
            birth_year: birthYear,
            gender: manualStudent.gender.trim() || null,
            school: manualStudent.school.trim() || null,
            city: manualStudent.city.trim() || null,
            facebook_url: manualStudent.facebook_url.trim() || null,
            threads_url: manualStudent.threads_url.trim() || null,
            hobbies: manualStudent.hobbies.trim() || null,
            target_score: targetScore,
            source: manualStudent.source.trim() || null,
          }],
        }),
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        const rowError = json.data?.errors?.[0]?.error
        setAddError(rowError ?? json.error ?? t('errAddFailed'))
        return
      }

      await refreshEnrollments()
      setAddSuccess(json.data?.created > 0 ? t('addedCreated') : t('addedEnrolled'))
      setManualStudent(emptyManualStudent)
      setTimeout(() => resetAddModal(), 700)
    } catch {
      setAddError(t('errConnect'))
    } finally {
      setAddLoading(false)
    }
  }

  async function addStudent() {
    const identifier = addIdentifier.trim()
    if (!identifier) return
    setAddError(null)
    setAddLoading(true)

    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
      const queryKey = isEmail ? 'email' : 'phone'
      const searchRes = await fetch(`/api/profiles?${queryKey}=${encodeURIComponent(identifier)}`)
      const searchJson = await searchRes.json()
      if (searchJson.error || !searchJson.data?.length) {
        setAddError(isEmail ? t('errNoStudentByEmail') : t('errNoStudentByPhone'))
        return
      }

      const student = searchJson.data[0] as StudentProfile

      // Enroll
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId, student_id: student.id }),
      })
      const json = await res.json()

      if (json.error) {
        setAddError(json.error)
        return
      }

      // Add to local state
      setEnrollments((prev) => [
        ...prev,
        {
          id: json.data.id,
          student_id: student.id,
          enrolled_at: json.data.enrolled_at,
          profiles: student,
        },
      ])
      resetAddModal()
    } finally {
      setAddLoading(false)
    }
  }

  async function removeStudent(enrollmentId: string) {
    setRemoveLoading(enrollmentId)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' })
      if (res.ok) {
        setEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId))
      }
    } finally {
      setRemoveLoading(null)
    }
  }

  // ── CSV import ────────────────────────────────────────────────────────────

  async function handleCsvFile(file: File) {
    setCsvParseError(null)
    setCsvImportResult(null)
    try {
      const rows = await parseStudentCSV(file)
      if (rows.length === 0) {
        setCsvParseError(t('errNoFileData'))
        return
      }
      setCsvPreviewRows(rows)
    } catch (err) {
      setCsvParseError(err instanceof Error ? err.message : t('errReadFile'))
    }
  }

  function removeCsvRow(index: number) {
    setCsvPreviewRows((prev) => {
      if (!prev) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? null : next
    })
  }

  async function handleCsvImport() {
    if (!csvPreviewRows) return
    const validRows = csvPreviewRows.filter((r) => !r.error)
    if (validRows.length === 0) return

    setCsvImporting(true)
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: validRows, class_id: classId }),
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        setCsvParseError(json.error ?? `Lỗi ${res.status}`)
        setCsvImportResult(json.data ?? null)
        return
      }

      const importId = json.data?.student_import_id
      if (!importId) {
        setCsvParseError(t('errImportNoId'))
        return
      }

      const status = await waitForStudentImport(importId)
      if (status.status === 'failed') {
        setCsvParseError(status.error_message ?? t('errImportCheck'))
        setCsvImportResult(status.result ?? null)
        return
      }

      setCsvImportResult(status.result)
      setCsvPreviewRows(null)

      await refreshEnrollments()
    } catch {
      setCsvParseError(t('errConnect'))
    } finally {
      setCsvImporting(false)
    }
  }

  const now = new Date().toISOString()
  const filteredStudents = enrollments.filter((e) => {
    const name = e.profiles?.full_name?.toLowerCase() ?? ''
    const phone = e.profiles?.phone ?? ''
    const q = studentSearch.toLowerCase()
    return name.includes(q) || phone.includes(q)
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="inline-flex rounded-2xl border border-white/70 bg-white/80 p-1 shadow-sm backdrop-blur-sm animate-fade-up">
        {[
          { key: 'weeks' as Tab, label: t('tabWeeks') },
          { key: 'students' as Tab, label: t('tabStudents', { count: enrollments.length }) },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
              activeTab === tab.key
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-mute-light hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: WEEKS ──────────────────────────────────────────────────────── */}
      {activeTab === 'weeks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-ink">{t('weeksTitle')}</h2>
            <Button size="sm" onClick={() => setAddingWeek(true)}>
              {t('addWeek')}
            </Button>
          </div>

          {addingWeek && (
            <Card className="border border-white/70 bg-white p-4 shadow-sm flex items-center gap-3 animate-fade-up">
              <Input
                placeholder={t('weekPlaceholder')}
                value={newWeekTitle}
                onChange={(e) => setNewWeekTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createWeek()}
                className="flex-1"
              />
              <Button size="sm" loading={weekLoading} onClick={createWeek}>{t('weekSave')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingWeek(false); setNewWeekTitle('') }}>{t('weekCancel')}</Button>
            </Card>
          )}

          {weeks.length === 0 && !addingWeek ? (
            <EmptyState
              title={t('emptyWeeks')}
              description={t('emptyWeeksDesc')}
              action={<Button size="sm" onClick={() => setAddingWeek(true)}>{t('addWeekAction')}</Button>}
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-2">
              {weeks.map((week) => {
                const weekInstances = instances.filter((i) => i.week_id === week.id)
                const isOpen = openWeeks.has(week.id)

                return (
                  <div key={week.id} className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm transition-all hover:shadow-md animate-fade-up">
                    <button
                      onClick={() => toggleWeek(week.id)}
                      className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-4 h-4 text-mute-light transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="font-medium text-ink">{week.title}</span>
                      </div>
                      <Badge variant="muted">{t('weekAssignments', { count: weekInstances.length })}</Badge>
                    </button>

                    {isOpen && (
                      <div className="border-t border-hairline-light bg-slate-50/80 p-4 space-y-2">
                        {weekInstances.length === 0 ? (
                          <div className="flex items-center justify-between py-3">
                            <p className="text-sm text-mute-light">
                              {t('noAssignmentsInWeek')}
                            </p>
                            <Link href={`/teacher/assignments/new?class_id=${classId}&week_id=${week.id}`}>
                              <Button size="sm" variant="secondary">{t('addAssignment')}</Button>
                            </Link>
                          </div>
                        ) : (
                          <>
                            {weekInstances.map((inst) => {
                              const isExpired = inst.deadline < now
                              const isPublished = !!inst.published_at
                              return (
                                <Link
                                  key={inst.id}
                                  href={`/teacher/assignments/${inst.id}`}
                                  className="block flex items-center justify-between gap-4 rounded-2xl border border-white bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                                >
                                  <div>
                                    <p className="font-medium text-sm text-ink">{inst.title}</p>
                                    <p className="text-xs text-mute-light mt-0.5">
                                      {t('deadlineLabel')} {new Date(inst.deadline).toLocaleDateString(dateLocale, {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isExpired ? (
                                      <Badge variant="muted">{t('badgeExpired')}</Badge>
                                    ) : isPublished ? (
                                      <Badge variant="success">{t('badgePublished')}</Badge>
                                    ) : (
                                      <Badge variant="warning">{t('badgeDraft')}</Badge>
                                    )}
                                  </div>
                                </Link>
                              )
                            })}
                            <div className="pt-1">
                              <Link href={`/teacher/assignments/new?class_id=${classId}&week_id=${week.id}`}>
                                <Button size="sm" variant="ghost">{t('addAssignment')}</Button>
                              </Link>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: STUDENTS ───────────────────────────────────────────────────── */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Input
              placeholder={t('searchStudents')}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={downloadStudentTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-mute-light hover:text-ink hover:border-gray-300 transition-all"
                title={t('downloadTemplate')}
              >
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('downloadTemplate')}
              </button>
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mr-1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {t('importCsv')}
              </Button>
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                {t('addStudentBtn')}
              </Button>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = '' }}
          />

          {/* CSV parse error */}
          {csvParseError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-warning">{csvParseError}</p>
            </div>
          )}

          {/* CSV import result */}
          {csvImportResult && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-green-700">{t('importDone')}</p>
              <p className="text-sm text-green-700">
                {t('importCreated', { created: csvImportResult.created, enrolled: csvImportResult.enrolled })}
                {csvImportResult.skipped > 0 && <> · {t('importSkipped', { count: csvImportResult.skipped })}</>}
              </p>
              {csvImportResult.errors.length > 0 && (
                <p className="text-xs text-red-600">
                  {t('importErrors', { errors: csvImportResult.errors.map((e) => e.email ?? e.error).join(', ') })}
                </p>
              )}
            </div>
          )}

          {filteredStudents.length === 0 ? (
            <EmptyState
              title={t('emptyStudents')}
              description={t('emptyStudentsDesc')}
              action={<Button size="sm" onClick={() => setShowAddModal(true)}>{t('addStudentBtn')}</Button>}
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredStudents.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white px-5 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                    {(enrollment.profiles?.full_name ?? 'S')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {enrollment.profiles?.full_name ?? t('studentUnknown')}
                    </p>
                    <p className="text-xs text-mute-light">
                      {enrollment.profiles?.phone ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {enrollment.profiles?.is_active ? (
                      <Badge variant="success">{t('statusActive')}</Badge>
                    ) : (
                      <Badge variant="error">{t('statusLocked')}</Badge>
                    )}
                    <button
                      onClick={() => setSelectedEnrollment(enrollment)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-blue-50"
                    >
                      {t('viewDetails')}
                    </button>
                    <button
                      onClick={() => removeStudent(enrollment.id)}
                      disabled={removeLoading === enrollment.id}
                      className="text-mute-light hover:text-warning transition-colors disabled:opacity-40 p-1"
                      title={t('removeTooltip')}
                    >
                      {removeLoading === enrollment.id ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!selectedEnrollment}
        onClose={() => setSelectedEnrollment(null)}
        title={t('studentDetailTitle')}
        size="lg"
      >
        {selectedEnrollment?.profiles && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm">
                {selectedEnrollment.profiles.full_name[0]?.toUpperCase() ?? 'S'}
              </div>
              <div>
                <h3 className="text-lg font-display font-semibold text-ink">
                  {selectedEnrollment.profiles.full_name}
                </h3>
                <p className="text-sm text-mute-light">
                  {t('enrolledOn', { date: new Date(selectedEnrollment.enrolled_at).toLocaleDateString(dateLocale) })}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [t('fieldPhone'), selectedEnrollment.profiles.phone || '—'],
                [t('fieldStatus'), selectedEnrollment.profiles.is_active ? t('statusActive') : t('statusLocked')],
                [t('fieldBirthYear'), selectedEnrollment.profiles.birth_year?.toString() ?? '—'],
                [t('fieldGender'), selectedEnrollment.profiles.gender || '—'],
                [t('fieldSchool'), selectedEnrollment.profiles.school || '—'],
                [t('fieldCity'), selectedEnrollment.profiles.city || '—'],
                [t('fieldSatGoal'), selectedEnrollment.profiles.target_score?.toString() ?? '—'],
                [t('fieldSource'), selectedEnrollment.profiles.source || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-medium text-mute-light">{label}</p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-medium text-mute-light">{t('fieldHobbies')}</p>
              <p className="mt-1 text-sm text-ink">{selectedEnrollment.profiles.hobbies || '—'}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-mute-light">{t('fieldFacebook')}</p>
                {selectedEnrollment.profiles.facebook_url ? (
                  <a
                    href={selectedEnrollment.profiles.facebook_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-primary hover:underline"
                  >
                    {selectedEnrollment.profiles.facebook_url}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-ink">—</p>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-mute-light">{t('fieldThreads')}</p>
                {selectedEnrollment.profiles.threads_url ? (
                  <a
                    href={selectedEnrollment.profiles.threads_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-primary hover:underline"
                  >
                    {selectedEnrollment.profiles.threads_url}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-ink">—</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Student Modal ──────────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={resetAddModal}
        title={t('addStudentTitle')}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            {[
              { value: 'manual' as AddStudentMode, label: t('modeManual') },
              { value: 'existing' as AddStudentMode, label: t('modeExisting') },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => { setAddMode(mode.value); setAddError(null); setAddSuccess(null) }}
                className={[
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                  addMode === mode.value
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-500 hover:text-ink',
                ].join(' ')}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {addError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-warning">{addError}</p>
            </div>
          )}
          {addSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">{addSuccess}</p>
            </div>
          )}

          {addMode === 'manual' ? (
            <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm font-semibold text-blue-900">{t('requiredInfo')}</p>
                <p className="mt-1 text-xs text-blue-700">{t('requiredInfoDesc')}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t('fieldFullName')}
                    placeholder="Nguyễn Văn An"
                    value={manualStudent.full_name}
                    onChange={(e) => updateManualStudent('full_name', e.target.value)}
                  />
                  <Input
                    label={t('fieldEmail')}
                    type="email"
                    placeholder="an.nguyen@gmail.com"
                    value={manualStudent.email}
                    onChange={(e) => updateManualStudent('email', e.target.value)}
                  />
                  <Input
                    label={t('fieldPhoneOptional')}
                    placeholder="0901234567"
                    value={manualStudent.phone}
                    onChange={(e) => updateManualStudent('phone', e.target.value)}
                  />
                  <Input
                    label={t('fieldBirthYearOptional')}
                    inputMode="numeric"
                    placeholder="2007"
                    value={manualStudent.birth_year}
                    onChange={(e) => updateManualStudent('birth_year', e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                <p className="text-sm font-semibold text-violet-900">{t('profileSection')}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t('fieldGenderOptional')}
                    placeholder={t('fieldGenderPlaceholder')}
                    value={manualStudent.gender}
                    onChange={(e) => updateManualStudent('gender', e.target.value)}
                  />
                  <Input
                    label={t('fieldSchoolOptional')}
                    placeholder={t('fieldSchoolPlaceholder')}
                    value={manualStudent.school}
                    onChange={(e) => updateManualStudent('school', e.target.value)}
                  />
                  <Input
                    label={t('fieldCityOptional')}
                    placeholder={t('fieldCityPlaceholder')}
                    value={manualStudent.city}
                    onChange={(e) => updateManualStudent('city', e.target.value)}
                  />
                  <Input
                    label={t('fieldSatGoalOptional')}
                    inputMode="numeric"
                    placeholder="1400"
                    value={manualStudent.target_score}
                    onChange={(e) => updateManualStudent('target_score', e.target.value)}
                  />
                  <Input
                    label={t('fieldFacebook')}
                    placeholder="https://facebook.com/..."
                    value={manualStudent.facebook_url}
                    onChange={(e) => updateManualStudent('facebook_url', e.target.value)}
                  />
                  <Input
                    label={t('fieldThreads')}
                    placeholder="https://threads.net/@..."
                    value={manualStudent.threads_url}
                    onChange={(e) => updateManualStudent('threads_url', e.target.value)}
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Textarea
                    label={t('fieldHobbiesOptional')}
                    placeholder={t('fieldHobbiesPlaceholder')}
                    rows={3}
                    value={manualStudent.hobbies}
                    onChange={(e) => updateManualStudent('hobbies', e.target.value)}
                  />
                  <Textarea
                    label={t('fieldSourceOptional')}
                    placeholder={t('fieldSourcePlaceholder')}
                    rows={3}
                    value={manualStudent.source}
                    onChange={(e) => updateManualStudent('source', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Button loading={addLoading} onClick={addManualStudent}>{t('createAndEnroll')}</Button>
                <Button variant="ghost" onClick={resetAddModal}>{tCommon('cancel')}</Button>
              </div>
            </>
          ) : (
            <>
              <Input
                label={t('existingLabel')}
                placeholder={t('existingPlaceholder')}
                value={addIdentifier}
                onChange={(e) => setAddIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStudent()}
              />
              <p className="text-xs text-mute-light">{t('existingHint')}</p>
              <div className="flex gap-3 pt-1">
                <Button loading={addLoading} onClick={addStudent}>{t('addToClass')}</Button>
                <Button variant="ghost" onClick={resetAddModal}>{tCommon('cancel')}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── CSV Preview Modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!csvPreviewRows}
        onClose={() => { setCsvPreviewRows(null); setCsvParseError(null) }}
        title={t('csvPreviewTitle')}
        size="xl"
      >
        {csvPreviewRows && (() => {
          const validCount   = csvPreviewRows.filter((r) => !r.error).length
          const invalidCount = csvPreviewRows.filter((r) =>  r.error).length
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t('csvValid', { count: validCount })}
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {t('csvInvalid', { count: invalidCount })}
                  </span>
                )}
                <span className="text-xs text-mute-light ml-auto">{t('csvTipRemove')}</span>
              </div>

              {/* Preview table */}
              <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase w-8">#</th>
                        {PREVIEW_COLS.map((col) => (
                          <th key={col.key} className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-mute-light uppercase">Status</th>
                        <th className="px-3 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i} className={`transition-colors ${row.error ? 'bg-red-50/60' : 'hover:bg-gray-50/70'}`}>
                          <td className="px-3 py-2.5 text-mute-light text-xs font-mono">{i + 1}</td>
                          {PREVIEW_COLS.map((col) => {
                            const val = row[col.key]
                            const isEmpty = val === null || val === undefined || val === ''
                            if (isEmpty) return <td key={col.key} className="px-3 py-2.5 text-gray-200 text-xs">—</td>
                            const isRequired = col.key === 'full_name' || col.key === 'email'
                            return (
                              <td key={col.key} className={`px-3 py-2.5 whitespace-nowrap max-w-[140px] truncate ${isRequired ? 'font-semibold text-ink' : 'text-xs text-mute-light'}`}>
                                {String(val)}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {row.error
                              ? <span className="inline-flex text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-100">{row.error}</span>
                              : <span className="inline-flex text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">✓ OK</span>
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => removeCsvRow(i)}
                              disabled={csvImporting}
                              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-gray-300 hover:text-red-500 transition-all disabled:opacity-30"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button loading={csvImporting} disabled={validCount === 0} onClick={handleCsvImport}>
                  {t('csvImportBtn', { count: validCount })}
                </Button>
                <Button variant="ghost" onClick={() => { setCsvPreviewRows(null); setCsvParseError(null) }} disabled={csvImporting}>
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

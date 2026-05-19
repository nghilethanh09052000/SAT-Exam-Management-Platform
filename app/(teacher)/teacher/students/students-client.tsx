'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

export interface TeacherStudent {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  birth_year: number | null
  gender: string | null
  school: string | null
  city: string | null
  target_score: number | null
  enrollments: {
    enrollment_id: string
    enrolled_at: string
    class_id: string
    class_title: string
    course_id: string
    course_title: string
  }[]
}

interface Props {
  students: TeacherStudent[]
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-cyan-400 to-sky-600',
]

function avatarGrad(name: string) {
  return AVATAR_GRADIENTS[(name.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]
}

function classSummary(student: TeacherStudent) {
  const first = student.enrollments[0]
  if (!first) return null
  return {
    classTitle: first.class_title,
    courseTitle: first.course_title,
    extraCount: Math.max(0, student.enrollments.length - 1),
  }
}

export function TeacherStudentsClient({ students }: Props) {
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<TeacherStudent | null>(null)

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return students.filter((student) => {
      if (!normalized) return true
      return (
        student.full_name.toLowerCase().includes(normalized) ||
        student.email.toLowerCase().includes(normalized) ||
        (student.phone ?? '').includes(search) ||
        student.enrollments.some((enrollment) =>
          enrollment.class_title.toLowerCase().includes(normalized) ||
          enrollment.course_title.toLowerCase().includes(normalized)
        )
      )
    })
  }, [students, search])

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Tổng học sinh" value={students.length} color="from-blue-500 to-indigo-600" />
        <Metric label="Đang hoạt động" value={students.filter((student) => student.is_active).length} color="from-emerald-400 to-teal-600" />
        <Metric label="Lượt ghi danh" value={students.reduce((sum, student) => sum + student.enrollments.length, 0)} color="from-violet-500 to-fuchsia-600" />
      </div>

      <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xl flex-1">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, email, SĐT, lớp hoặc khóa học..."
              className="pl-9"
            />
          </div>
          <p className="text-sm font-semibold text-mute-light">{filtered.length} học sinh</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1040px] grid-cols-[minmax(180px,1.4fr)_minmax(200px,1.5fr)_minmax(220px,1.5fr)_120px_130px_120px] border-b border-slate-100 bg-slate-50 px-5 py-3">
            {['Học sinh', 'Email', 'Lớp học', 'SĐT', 'Trạng thái', 'Chi tiết'].map((header) => (
              <span key={header} className="pr-3 text-xs font-black uppercase tracking-wide text-slate-400">{header}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-mute-light">Không tìm thấy học sinh phù hợp.</div>
          ) : (
            <ul className="min-w-[1040px] divide-y divide-slate-50">
              {filtered.map((student, index) => {
                const cls = classSummary(student)
                return (
                  <li key={student.id} className="grid grid-cols-[minmax(180px,1.4fr)_minmax(200px,1.5fr)_minmax(220px,1.5fr)_120px_130px_120px] items-center px-5 py-4 transition-colors hover:bg-slate-50/70 animate-fade-up" style={{ animationDelay: `${index * 25}ms` }}>
                    <div className="flex min-w-0 items-center gap-3 pr-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGrad(student.full_name)} text-xs font-black text-white shadow-sm`}>
                        {student.full_name[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="truncate text-sm font-bold text-ink">{student.full_name}</span>
                    </div>
                    <span className="truncate pr-3 text-sm font-medium text-slate-500">{student.email || '—'}</span>
                    <div className="min-w-0 pr-3">
                      {cls ? (
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1" title={`${cls.courseTitle} · ${cls.classTitle}`}>
                          <svg className="h-3.5 w-3.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
                          </svg>
                          <span className="truncate text-xs font-semibold text-blue-700">{cls.classTitle}</span>
                          {cls.extraCount > 0 && <span className="shrink-0 text-xs font-bold text-blue-500">+{cls.extraCount}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-mute-light">—</span>
                      )}
                    </div>
                    <span className="pr-3 text-xs font-medium text-mute-light">{student.phone || '—'}</span>
                    <div className="pr-3">
                      {student.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Vô hiệu
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(student)}
                      className="w-fit rounded-xl px-3 py-2 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      Xem chi tiết
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <Modal open={!!selectedStudent} onClose={() => setSelectedStudent(null)} title="Chi tiết học sinh" size="lg">
        {selectedStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGrad(selectedStudent.full_name)} text-lg font-black text-white shadow-sm`}>
                {selectedStudent.full_name[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <h3 className="text-lg font-display font-semibold text-ink">{selectedStudent.full_name}</h3>
                <p className="text-sm text-mute-light">{selectedStudent.email || '—'}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Số điện thoại', selectedStudent.phone || '—'],
                ['Trạng thái', selectedStudent.is_active ? 'Hoạt động' : 'Vô hiệu'],
                ['Năm sinh', selectedStudent.birth_year?.toString() ?? '—'],
                ['Giới tính', selectedStudent.gender || '—'],
                ['Trường học', selectedStudent.school || '—'],
                ['Tỉnh / thành phố', selectedStudent.city || '—'],
                ['Mục tiêu SAT', selectedStudent.target_score?.toString() ?? '—'],
                ['Ngày tạo', new Date(selectedStudent.created_at).toLocaleDateString('vi-VN')],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-surface-soft p-3">
                  <p className="text-xs font-medium text-mute-light">{label}</p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-surface-soft p-3">
              <p className="mb-2 text-xs font-medium text-mute-light">Lớp học / khóa học</p>
              <div className="space-y-2">
                {selectedStudent.enrollments.map((enrollment) => (
                  <div key={enrollment.enrollment_id} className="rounded-lg bg-white px-3 py-2 text-sm">
                    <p className="font-medium text-ink">{enrollment.course_title}</p>
                    <p className="text-mute-light">{enrollment.class_title} · {new Date(enrollment.enrolled_at).toLocaleDateString('vi-VN')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-3xl bg-gradient-to-br ${color} p-5 text-white shadow-xl shadow-blue-500/10`}>
      <p className="text-sm font-bold text-white/75">{label}</p>
      <p className="mt-2 text-4xl font-black leading-none">{value}</p>
    </div>
  )
}

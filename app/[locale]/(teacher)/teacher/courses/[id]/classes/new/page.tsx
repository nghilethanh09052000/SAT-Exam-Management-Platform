'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface PageProps {
  params: { id: string }
}

interface CourseRow {
  id: string
  title: string
  start_date: string
  end_date: string
}

const WEEKDAYS = [
  { value: '2', label: 'Thứ 2' },
  { value: '3', label: 'Thứ 3' },
  { value: '4', label: 'Thứ 4' },
  { value: '5', label: 'Thứ 5' },
  { value: '6', label: 'Thứ 6' },
  { value: '7', label: 'Thứ 7' },
  { value: 'CN', label: 'Chủ nhật' },
]

type TextField = 'title' | 'start_time' | 'end_time'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('vi-VN')
}

function formatScheduleDays(days: string[]) {
  const orderedDays = WEEKDAYS.map((day) => day.value).filter((day) => days.includes(day))
  const weekdayNumbers = orderedDays.filter((day) => day !== 'CN')
  const hasSunday = orderedDays.includes('CN')

  if (weekdayNumbers.length === 0) return 'Chủ nhật'
  return `Thứ ${weekdayNumbers.join(', ')}${hasSunday ? ', Chủ nhật' : ''}`
}

export default function NewClassPage({ params }: PageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [course, setCourse] = useState<CourseRow | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    weekdays: [] as string[],
    start_time: '',
    end_time: '',
  })

  function handleChange(field: TextField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function toggleWeekday(day: string) {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((item) => item !== day)
        : [...prev.weekdays, day],
    }))
    setError(null)
  }

  const scheduleText = useMemo(() => {
    if (form.weekdays.length === 0 || !form.start_time || !form.end_time) return ''
    return `${formatScheduleDays(form.weekdays)} - ${form.start_time} đến ${form.end_time}`
  }, [form.end_time, form.start_time, form.weekdays])

  useEffect(() => {
    let mounted = true

    async function loadCourse() {
      setCourseLoading(true)
      try {
        const res = await fetch(`/api/courses/${params.id}`)
        const json: { data?: CourseRow | null; error?: string | null } = await res.json()
        if (!mounted) return
        if (!res.ok || json.error || !json.data) {
          setError(json.error ?? 'Không tải được thông tin khóa học.')
          return
        }
        setCourse(json.data)
      } catch {
        if (mounted) setError('Không tải được thông tin khóa học.')
      } finally {
        if (mounted) setCourseLoading(false)
      }
    }

    loadCourse()
    return () => {
      mounted = false
    }
  }, [params.id])

  function validate(): string | null {
    if (!form.title.trim()) return 'Vui lòng nhập tên lớp học.'
    if (form.weekdays.length === 0) return 'Vui lòng chọn ít nhất một ngày học.'
    if (!form.start_time || !form.end_time) return 'Vui lòng chọn giờ bắt đầu và giờ kết thúc.'
    if (form.start_time >= form.end_time) return 'Giờ kết thúc phải sau giờ bắt đầu.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: params.id,
          title: form.title.trim(),
          schedule_text: scheduleText,
        }),
      })

      let json: { data?: { id: string; title: string } | null; error?: string | null }
      try {
        json = await res.json()
      } catch {
        setError('Server trả về phản hồi không hợp lệ.')
        return
      }

      if (!res.ok || json.error) {
        setError(json.error ?? `Lỗi ${res.status}. Vui lòng thử lại.`)
        return
      }

      if (!json.data?.id) {
        setError('Tạo lớp thất bại. Vui lòng thử lại.')
        return
      }

      router.push(`/teacher/courses/${params.id}/classes/${json.data.id}`)
      router.refresh()
    } catch (err) {
      console.error('Create class error:', err)
      setError('Đã có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-3.5rem)] bg-slate-50 p-4 md:-m-8 md:min-h-screen md:p-8">
      <div className="max-w-2xl">
        <PageHeader
          title="Thêm lớp học"
          breadcrumbs={[
            { label: 'Khóa học', href: '/teacher/courses' },
            { label: 'Chi tiết khóa học', href: `/teacher/courses/${params.id}` },
            { label: 'Thêm lớp' },
          ]}
        />

        <Card className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-mute-light">Khóa học</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {courseLoading ? 'Đang tải...' : course?.title ?? 'Không có thông tin khóa học.'}
                </p>
              </div>
              <p className="text-sm text-mute-light">
                {course ? `${formatDate(course.start_date)} - ${formatDate(course.end_date)}` : ''}
              </p>
            </div>

            <Input
              label="Tên lớp *"
              placeholder="Ví dụ: Lớp A1 - Sáng thứ 7"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
            />

            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-medium text-ink">Lịch học *</p>
                <p className="mt-1 text-xs text-mute-light">
                  Chọn các ngày học lặp lại trong thời gian khóa học.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const selected = form.weekdays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      className={[
                        'min-w-20 rounded-[6px] border px-3 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-blue-50 text-primary'
                          : 'border-slate-200 bg-white text-ink hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                      aria-pressed={selected}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Giờ bắt đầu *"
                type="time"
                value={form.start_time}
                onChange={(e) => handleChange('start_time', e.target.value)}
              />
              <Input
                label="Giờ kết thúc *"
                type="time"
                value={form.end_time}
                onChange={(e) => handleChange('end_time', e.target.value)}
              />
            </div>

            <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-mute-light">Xem trước lịch học</p>
              <p className="mt-1 text-sm text-ink">
                {scheduleText || 'Chọn ngày học và giờ học để tạo lịch.'}
              </p>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              <Button type="submit" size="sm" loading={loading}>
                Tạo lớp
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
                Hủy
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

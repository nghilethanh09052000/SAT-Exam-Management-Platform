'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface PageProps {
  params: { id: string }
}

export default function NewClassPage({ params }: PageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    schedule_text: '',
    start_date: '',
    end_date: '',
  })

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function validate(): string | null {
    if (!form.title.trim()) return 'Vui lòng nhập tên lớp học.'
    if (!form.start_date) return 'Vui lòng chọn ngày bắt đầu.'
    if (!form.end_date) return 'Vui lòng chọn ngày kết thúc.'
    if (form.start_date >= form.end_date) return 'Ngày kết thúc phải sau ngày bắt đầu.'
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
          schedule_text: form.schedule_text.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
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
    } catch (err) {
      console.error('Create class error:', err)
      setError('Đã có lỗi xảy ra. Vui lòng kiểm tra kết nối và thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Thêm lớp học"
        breadcrumbs={[
          { label: 'Khóa học', href: '/teacher/courses' },
          { label: 'Chi tiết khóa học', href: `/teacher/courses/${params.id}` },
          { label: 'Thêm lớp' },
        ]}
      />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <Input
            label="Tên lớp *"
            placeholder="Ví dụ: Lớp A1 - Sáng thứ 7"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />

          <Input
            label="Lịch học (tùy chọn)"
            placeholder="Ví dụ: Thứ 7 & Chủ nhật 8:00 - 10:00"
            value={form.schedule_text}
            onChange={(e) => handleChange('schedule_text', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ngày bắt đầu *"
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
            />
            <Input
              label="Ngày kết thúc *"
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Tạo lớp
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Hủy
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

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

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: params.id,
          title: form.title,
          schedule_text: form.schedule_text || null,
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      router.push(`/teacher/courses/${params.id}/classes/${json.data.id}`)
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
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
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-[6px] bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-warning">{error}</p>
            </div>
          )}

          <Input
            label="Tên lớp"
            placeholder="Ví dụ: Lớp A1 - Sáng thứ 7"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
            required
          />

          <Input
            label="Lịch học (tùy chọn)"
            placeholder="Ví dụ: Thứ 7 & Chủ nhật 8:00 - 10:00"
            value={form.schedule_text}
            onChange={(e) => handleChange('schedule_text', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ngày bắt đầu"
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              required
            />
            <Input
              label="Ngày kết thúc"
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
              required
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

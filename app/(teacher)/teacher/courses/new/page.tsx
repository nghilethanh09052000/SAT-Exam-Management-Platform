'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function NewCoursePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    start_date: '',
    end_date: '',
    expires_at: '',
  })

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          start_date: form.start_date,
          end_date: form.end_date,
          expires_at: form.expires_at || null,
        }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      router.push(`/teacher/courses/${json.data.id}`)
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Tạo khóa học mới"
        breadcrumbs={[
          { label: 'Khóa học', href: '/teacher/courses' },
          { label: 'Tạo mới' },
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
            label="Tên khóa học"
            placeholder="Ví dụ: SAT Spring 2025"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
            required
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

          <Input
            label="Hạn truy cập (tùy chọn)"
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => handleChange('expires_at', e.target.value)}
          />

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Tạo khóa học
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Hủy
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

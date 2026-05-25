'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function NewCoursePage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.courses')
  const tNav = useTranslations('nav')
  const tCommon = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    start_date: '',
    end_date: '',
    expires_at: '',
  })

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function validate(): string | null {
    if (!form.title.trim()) return t('errMissingTitle')
    if (!form.start_date) return t('errMissingStart')
    if (!form.end_date) return t('errMissingEnd')
    if (form.start_date >= form.end_date) return t('errDateOrder')
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
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
      }
      if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString()

      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let json: { data?: { id: string; title: string } | null; error?: string | null }
      try {
        json = await res.json()
      } catch {
        setError(t('errInvalidResponse'))
        return
      }

      if (!res.ok || json.error) {
        setError(json.error ?? t('errGeneric'))
        return
      }

      if (!json.data?.id) {
        setError(t('errCourseFailed'))
        return
      }

      router.push(`/${locale}/teacher/courses/${json.data.id}`)
      router.refresh()
    } catch (err) {
      console.error('Create course error:', err)
      setError(t('errGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title={t('newTitle')}
        breadcrumbs={[
          { label: tNav('courses'), href: '/teacher/courses' },
          { label: t('breadcrumbNew') },
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
            label={t('labelTitle')}
            placeholder={t('placeholderTitle')}
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('labelStart')}
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
            />
            <Input
              label={t('labelEnd')}
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
            />
          </div>

          <div>
            <Input
              label={t('labelExpiry')}
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => handleChange('expires_at', e.target.value)}
            />
            <p className="text-xs text-mute-light mt-1">
              {t('expiryHint')}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {t('submitBtn')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

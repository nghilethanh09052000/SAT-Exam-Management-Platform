'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type ExamPaperValues = {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
}

export function EditExamPaperForm({ paper }: { paper: ExamPaperValues }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.examPapers')
  const [title, setTitle] = useState(paper.title ?? '')
  const [source, setSource] = useState(paper.source ?? '')
  const [year, setYear] = useState(paper.year != null ? String(paper.year) : '')
  const [description, setDescription] = useState(paper.description ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!title.trim()) {
      setError(t('errNoTitle'))
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/exam-papers/${paper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          source: source.trim() || null,
          year: year.trim() ? Number(year) : null,
          description: description.trim() || null,
        }),
      })
      const json = await response.json()
      if (!response.ok || json.error) {
        setError(json.error ?? t('errGeneric'))
        return
      }
      router.push(`/${locale}/teacher/exam-papers/${paper.id}`)
      router.refresh()
    } catch {
      setError(t('errGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-warning">{error}</div>}
      <Input label={t('labelTitle')} placeholder={t('titlePlaceholder')} value={title} onChange={(event) => setTitle(event.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('labelSource')} placeholder={t('sourcePlaceholder')} value={source} onChange={(event) => setSource(event.target.value)} />
        <Input label={t('labelYear')} type="number" min={2000} max={2100} placeholder={t('yearPlaceholder')} value={year} onChange={(event) => setYear(event.target.value)} />
      </div>
      <label className="space-y-1.5 text-sm font-semibold text-ink">
        <span>{t('labelDescription')}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('descriptionPlaceholder')}
          rows={4}
          className="w-full rounded-lg border border-ash-light bg-white px-3 py-2 text-sm"
        />
      </label>
      <div className="flex gap-3 pt-2">
        <Button onClick={submit} loading={loading}>{t('saveExam')}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t('cancelBtn')}</Button>
      </div>
    </Card>
  )
}

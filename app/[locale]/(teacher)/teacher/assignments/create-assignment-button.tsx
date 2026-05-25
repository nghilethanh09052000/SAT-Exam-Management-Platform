'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export function CreateAssignmentButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.assignments')

  function handleClick() {
    setLoading(true)
    router.push(`/${locale}/teacher/assignments/new`)
  }

  return (
    <Button loading={loading} disabled={loading} onClick={handleClick}>
      {t('new')}
    </Button>
  )
}

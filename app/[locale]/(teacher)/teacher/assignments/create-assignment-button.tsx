'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAsyncAction } from '@/hooks/use-async'

export function CreateAssignmentButton() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('teacher.assignments')

  const { loading, run: handleClick } = useAsyncAction(async () => {
    router.push(`/${locale}/teacher/assignments/new`)
  })

  return (
    <Button loading={loading} onClick={handleClick}>
      {t('new')}
    </Button>
  )
}

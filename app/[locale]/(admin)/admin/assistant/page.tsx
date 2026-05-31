import { setRequestLocale, getTranslations } from 'next-intl/server'
import { AssistantFullPage } from '@/components/assistant/AssistantFullPage'

export default async function AdminAssistantPage({
  params,
}: {
  params: { locale: string }
}) {
  setRequestLocale(params.locale)
  const t = await getTranslations('assistant')

  return <AssistantFullPage role="admin" title={t('fullPage.title')} subtitle={t('fullPage.subtitle')} />
}

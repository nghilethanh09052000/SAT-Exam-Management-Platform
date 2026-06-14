import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

// Fallback: middleware redirects / → /[defaultLocale] first, but this handles edge cases
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`)
}

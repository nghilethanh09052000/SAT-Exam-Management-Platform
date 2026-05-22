import { redirect } from 'next/navigation'

// Fallback: middleware redirects / → /en first, but this handles edge cases
export default function RootPage() {
  redirect('/en')
}

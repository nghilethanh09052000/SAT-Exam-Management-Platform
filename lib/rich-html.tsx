import { renderMathInHtml } from '@/lib/math-html'

interface RichHtmlProps {
  html: string
  className?: string
}

export function RichHtml({ html, className }: RichHtmlProps) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathInHtml(html) }}
    />
  )
}

import { renderMathInHtml } from '@/lib/math-html'
import { decodeEscapedMediaHtml } from '@/lib/rich-html-media'

interface RichHtmlProps {
  html: string
  className?: string
}

export function RichHtml({ html, className }: RichHtmlProps) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathInHtml(decodeEscapedMediaHtml(html)) }}
    />
  )
}

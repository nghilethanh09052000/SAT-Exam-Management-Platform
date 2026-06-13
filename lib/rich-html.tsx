import { renderMathInHtml } from '@/lib/math-html'
import { decodeEscapedMediaHtml } from '@/lib/rich-html-media'

interface RichHtmlProps {
  html: string
  className?: string
}

export function RichHtml({ html, className }: RichHtmlProps) {
  // Must be a block element: callers pass block box utilities (border, rounded,
  // bg, padding). On an inline <span> those paint a separate, padding-inflated
  // background box per wrapped line, so later lines overprint earlier ones and
  // plain-text content (no block tags of its own) renders washed-out/garbled.
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathInHtml(decodeEscapedMediaHtml(html)) }}
    />
  )
}

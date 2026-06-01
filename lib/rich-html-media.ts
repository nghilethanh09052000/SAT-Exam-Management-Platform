import { decodeHtmlEntities } from '@/lib/html-text'

export function decodeEscapedMediaHtml(content: string): string {
  return content
    .replace(/&lt;p(?:\s[^&]*?)?&gt;\s*&lt;img\b[\s\S]*?&gt;\s*&lt;\/p&gt;/gi, (match) => decodeHtmlEntities(match))
    .replace(/&lt;img\b[\s\S]*?&gt;/gi, (match) => decodeHtmlEntities(match))
    .replace(/&lt;svg\b[\s\S]*?&lt;\/svg&gt;/gi, (match) => decodeHtmlEntities(match))
}

export function extractMediaHtml(content: string): string[] {
  const normalized = decodeEscapedMediaHtml(content)
  const media = normalized.match(/<p(?:\s[^>]*)?>\s*<(?:img|svg)\b[\s\S]*?<\/p>|<img\b[^>]*>|<svg\b[\s\S]*?<\/svg>/gi)
  return media ?? []
}


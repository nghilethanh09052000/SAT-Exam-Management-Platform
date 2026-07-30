export interface HighlightRange {
  text: string
  start?: number
  end?: number
  scope?: string
}

export interface HighlightSegment {
  text: string
  highlightIndex?: number
}

export interface DomHighlightSelection {
  text: string
  scope: string
  start: number
  end: number
}

interface ResolvedRange {
  start: number
  end: number
  highlightIndex: number
}

function normalizeCharacter(character: string) {
  if (/[‘’ʼ`]/.test(character)) return "'"
  if (/[“”]/.test(character)) return '"'
  return character.toLowerCase()
}

function normalizeWithSourceMap(source: string) {
  let normalized = ''
  const starts: number[] = []
  const ends: number[] = []

  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) {
      const start = index
      while (index < source.length && /\s/.test(source[index])) index++
      normalized += ' '
      starts.push(start)
      ends.push(index)
      continue
    }

    normalized += normalizeCharacter(source[index])
    starts.push(index)
    ends.push(index + 1)
    index++
  }

  return { normalized, starts, ends }
}

function normalizeSearchTerm(value: string) {
  return Array.from(value)
    .map(normalizeCharacter)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveDomHighlightSelection(range: Range): DomHighlightSelection | null {
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
  const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
    ? range.endContainer as Element
    : range.endContainer.parentElement
  const selectable = startElement?.closest<HTMLElement>('[data-highlight-scope]')
  const scope = selectable?.dataset.highlightScope
  if (!selectable || !scope || !endElement || !selectable.contains(endElement)) return null

  const rawSelectedText = range.toString()
  const text = rawSelectedText.trim()
  if (text.length < 2) return null

  const beforeSelection = range.cloneRange()
  beforeSelection.selectNodeContents(selectable)
  beforeSelection.setEnd(range.startContainer, range.startOffset)
  const leadingWhitespace = rawSelectedText.length - rawSelectedText.trimStart().length
  const start = beforeSelection.toString().length + leadingWhitespace

  return {
    text,
    scope,
    start,
    end: start + text.length,
  }
}

/**
 * Converts persisted highlight metadata into exact, non-destructive text
 * segments. New highlights use start/end offsets. Legacy text-only highlights
 * are resolved to their first matching occurrence for backward compatibility.
 */
export function buildHighlightSegments(
  source: string,
  highlights: HighlightRange[],
  scope: string
): HighlightSegment[] {
  if (!source || highlights.length === 0) return [{ text: source }]

  const sourceMap = normalizeWithSourceMap(source)
  const resolved: ResolvedRange[] = []

  highlights.forEach((highlight, highlightIndex) => {
    const hasExactRange =
      highlight.scope === scope &&
      Number.isInteger(highlight.start) &&
      Number.isInteger(highlight.end) &&
      highlight.start! >= 0 &&
      highlight.end! > highlight.start! &&
      highlight.end! <= source.length

    if (hasExactRange) {
      resolved.push({
        start: highlight.start!,
        end: highlight.end!,
        highlightIndex,
      })
      return
    }

    // A range belonging to another rendered region must not leak into this one.
    if (highlight.scope || highlight.start !== undefined || highlight.end !== undefined) return

    const term = normalizeSearchTerm(highlight.text)
    if (!term) return
    const normalizedStart = sourceMap.normalized.indexOf(term)
    if (normalizedStart < 0) return
    const normalizedEnd = normalizedStart + term.length - 1
    resolved.push({
      start: sourceMap.starts[normalizedStart],
      end: sourceMap.ends[normalizedEnd],
      highlightIndex,
    })
  })

  if (resolved.length === 0) return [{ text: source }]

  const boundaries = Array.from(new Set([
    0,
    source.length,
    ...resolved.flatMap((range) => [range.start, range.end]),
  ])).sort((a, b) => a - b)

  const segments: HighlightSegment[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    if (end <= start) continue

    // The most recently created highlight owns an overlapping segment, while
    // the non-overlapping parts of earlier highlights remain visible.
    const active = resolved
      .filter((range) => range.start <= start && range.end >= end)
      .sort((a, b) => b.highlightIndex - a.highlightIndex)[0]

    const segment = {
      text: source.slice(start, end),
      highlightIndex: active?.highlightIndex,
    }
    const previous = segments[segments.length - 1]
    if (previous && previous.highlightIndex === segment.highlightIndex) {
      previous.text += segment.text
    } else {
      segments.push(segment)
    }
  }

  return segments
}

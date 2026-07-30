import { buildHighlightSegments, resolveDomHighlightSelection } from '@/lib/highlight-ranges'

describe('buildHighlightSegments', () => {
  const source = 'Although critics believed that customers would never agree.'

  it('keeps multiple exact highlights without replacing earlier ranges', () => {
    expect(buildHighlightSegments(source, [
      { text: 'critics', scope: 'stimulus', start: 9, end: 16 },
      { text: 'customers', scope: 'stimulus', start: 31, end: 40 },
    ], 'stimulus')).toEqual([
      { text: 'Although ' },
      { text: 'critics', highlightIndex: 0 },
      { text: ' believed that ' },
      { text: 'customers', highlightIndex: 1 },
      { text: ' would never agree.' },
    ])
  })

  it('retains the exact selected characters instead of expanding to a sentence', () => {
    expect(buildHighlightSegments(source, [
      { text: 'lie', scope: 'stimulus', start: 19, end: 22 },
    ], 'stimulus')).toEqual([
      { text: 'Although critics be' },
      { text: 'lie', highlightIndex: 0 },
      { text: 'ved that customers would never agree.' },
    ])
  })

  it('does not render a range in a different content region', () => {
    expect(buildHighlightSegments(source, [
      { text: 'critics', scope: 'prompt', start: 9, end: 16 },
    ], 'stimulus')).toEqual([{ text: source }])
  })

  it('continues to render legacy text-only highlights', () => {
    expect(buildHighlightSegments('Curly “quotes” work', [
      { text: '"quotes"' },
    ], 'content')).toEqual([
      { text: 'Curly ' },
      { text: '“quotes”', highlightIndex: 0 },
      { text: ' work' },
    ])
  })

  it('calculates an exact range inside previously highlighted markup', () => {
    document.body.innerHTML = `
      <div data-highlight-scope="stimulus">Although <mark>critics</mark> believed</div>
    `
    const selectable = document.querySelector('[data-highlight-scope="stimulus"]')!
    const markedText = selectable.querySelector('mark')!.firstChild!
    const range = document.createRange()
    range.setStart(markedText, 1)
    range.setEnd(markedText, 4)

    expect(resolveDomHighlightSelection(range)).toEqual({
      text: 'rit',
      scope: 'stimulus',
      start: 10,
      end: 13,
    })
  })

  it('rejects selections spanning different content regions', () => {
    document.body.innerHTML = `
      <div data-highlight-scope="stimulus">Passage text</div>
      <div data-highlight-scope="prompt">Question text</div>
    `
    const containers = document.querySelectorAll('[data-highlight-scope]')
    const range = document.createRange()
    range.setStart(containers[0].firstChild!, 0)
    range.setEnd(containers[1].firstChild!, 8)

    expect(resolveDomHighlightSelection(range)).toBeNull()
  })
})

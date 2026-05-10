import { normalizeText } from '@/lib/utils/normalize'

describe('normalizeText', () => {
  it('lowercases the input', () => {
    expect(normalizeText('Hello World')).toBe('hello world')
  })

  it('strips punctuation', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeText('Hello   World')).toBe('hello world')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('')
  })

  it('removes all punctuation types', () => {
    expect(normalizeText("It's a test... (really)!")).toBe('its a test really')
  })

  it('keeps digits', () => {
    expect(normalizeText('Answer: 8.0')).toBe('answer 80')
  })

  it('handles Vietnamese characters', () => {
    const result = normalizeText('Học sinh')
    expect(typeof result).toBe('string')
    expect(result.trim().length).toBeGreaterThan(0)
  })
})

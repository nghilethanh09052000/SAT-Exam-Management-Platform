import { canCreateAttempt, canRevealReview, getMaxAttempts } from '@/lib/utils/submission-rules'

describe('submission rules', () => {
  test('max_retakes counts retries after the first attempt', () => {
    expect(getMaxAttempts(0)).toBe(1)
    expect(getMaxAttempts(2)).toBe(3)
  })

  test('rejects attempts once the configured retry limit is exhausted', () => {
    expect(canCreateAttempt(0, 0)).toBe(true)
    expect(canCreateAttempt(1, 0)).toBe(false)
    expect(canCreateAttempt(2, 2)).toBe(true)
    expect(canCreateAttempt(3, 2)).toBe(false)
  })

  test('reveals review immediately only when configured or after deadline', () => {
    const now = new Date('2026-05-17T12:00:00.000Z')
    expect(canRevealReview('immediately', '2026-05-18T00:00:00.000Z', now)).toBe(true)
    expect(canRevealReview('after_deadline', '2026-05-18T00:00:00.000Z', now)).toBe(false)
    expect(canRevealReview('after_deadline', '2026-05-16T00:00:00.000Z', now)).toBe(true)
  })
})

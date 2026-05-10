import { calculateRawScore, isShortAnswerCorrect, buildScoreSummary } from '@/lib/utils/score'

describe('calculateRawScore', () => {
  it('returns 0 for empty answers', () => {
    expect(calculateRawScore([])).toBe(0)
  })

  it('counts only correct answers', () => {
    const answers = [
      { is_correct: true },
      { is_correct: false },
      { is_correct: true },
      { is_correct: null },
    ]
    expect(calculateRawScore(answers)).toBe(2)
  })

  it('returns total when all correct', () => {
    const answers = [{ is_correct: true }, { is_correct: true }]
    expect(calculateRawScore(answers)).toBe(2)
  })

  it('ignores null is_correct', () => {
    const answers = [{ is_correct: null }, { is_correct: null }]
    expect(calculateRawScore(answers)).toBe(0)
  })
})

describe('isShortAnswerCorrect', () => {
  it('matches exact answer', () => {
    expect(isShortAnswerCorrect('8', ['8'])).toBe(true)
  })

  it('matches with normalization (trailing space)', () => {
    expect(isShortAnswerCorrect('8.0 ', ['8.0'])).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(isShortAnswerCorrect('forty-eight', ['Forty-Eight'])).toBe(true)
  })

  it('returns false for non-matching answer', () => {
    expect(isShortAnswerCorrect('9', ['8', '8.0'])).toBe(false)
  })

  it('matches against any accepted answer', () => {
    expect(isShortAnswerCorrect('eight', ['8', '8.0', 'eight'])).toBe(true)
  })

  it('returns false for empty accepted answers', () => {
    expect(isShortAnswerCorrect('8', [])).toBe(false)
  })
})

describe('buildScoreSummary', () => {
  it('builds correct summary', () => {
    const answers = [
      { is_correct: true },
      { is_correct: false },
      { is_correct: true },
    ]
    const summary = buildScoreSummary(answers)
    expect(summary.rawScore).toBe(2)
    expect(summary.totalQuestions).toBe(3)
    expect(summary.percentageCorrect).toBe(67)
    expect(summary.scaledScore).toBeNull()
  })

  it('handles zero questions', () => {
    const summary = buildScoreSummary([])
    expect(summary.percentageCorrect).toBe(0)
    expect(summary.rawScore).toBe(0)
  })
})

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

  // ── SAT grid-in numeric equivalence (matches the on-screen directions table) ──
  describe('grid-in numeric equivalence', () => {
    // Answer 3.5 → accept 3.5, 3.50, 7/2 ; reject 31/2, "3 1/2"
    it('treats 3.5, 3.50 and 7/2 as equivalent', () => {
      expect(isShortAnswerCorrect('3.5', ['3.5'])).toBe(true)
      expect(isShortAnswerCorrect('3.50', ['3.5'])).toBe(true)
      expect(isShortAnswerCorrect('7/2', ['3.5'])).toBe(true)
      expect(isShortAnswerCorrect('3.5', ['7/2'])).toBe(true)
    })

    it('rejects 31/2 and the mixed number "3 1/2" for answer 3.5', () => {
      expect(isShortAnswerCorrect('31/2', ['3.5'])).toBe(false)
      expect(isShortAnswerCorrect('3 1/2', ['3.5'])).toBe(false)
    })

    // Answer 2/3 → accept 2/3, .6666, .6667, 0.666, 0.667 ; reject .66, 0.66, .67, 0.67
    it('accepts adequately-precise decimal forms of 2/3', () => {
      for (const ok of ['2/3', '.6666', '.6667', '0.666', '0.667', '4/6']) {
        expect(isShortAnswerCorrect(ok, ['2/3'])).toBe(true)
      }
    })

    it('rejects under-precise decimal forms of 2/3', () => {
      for (const bad of ['.66', '0.66', '.67', '0.67']) {
        expect(isShortAnswerCorrect(bad, ['2/3'])).toBe(false)
      }
    })

    // Answer -1/3 → accept -1/3, -.3333, -0.333 ; reject -.33, -0.33
    it('handles negative fractions and their decimal forms', () => {
      expect(isShortAnswerCorrect('-1/3', ['-1/3'])).toBe(true)
      expect(isShortAnswerCorrect('-.3333', ['-1/3'])).toBe(true)
      expect(isShortAnswerCorrect('-0.333', ['-1/3'])).toBe(true)
      expect(isShortAnswerCorrect('-.33', ['-1/3'])).toBe(false)
      expect(isShortAnswerCorrect('-0.33', ['-1/3'])).toBe(false)
    })

    it('does not let stripped punctuation create false matches (72 ≠ 7/2)', () => {
      expect(isShortAnswerCorrect('72', ['7/2'])).toBe(false)
    })

    it('rejects forbidden grid-in symbols (comma, percent, dollar)', () => {
      expect(isShortAnswerCorrect('3,500', ['3500'])).toBe(false)
      expect(isShortAnswerCorrect('50%', ['0.5'])).toBe(false)
      expect(isShortAnswerCorrect('$5', ['5'])).toBe(false)
    })

    it('still matches integer answers exactly', () => {
      expect(isShortAnswerCorrect('9', ['9'])).toBe(true)
      expect(isShortAnswerCorrect('9', ['8'])).toBe(false)
    })
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

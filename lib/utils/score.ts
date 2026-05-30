/**
 * lib/utils/score.ts
 * Raw score calculation from submission_answers.
 *
 * Rules from CLAUDE.md:
 * - raw_score = count of submission_answers where is_correct = true
 * - scaled_score = NULL for now (Phase 2)
 * - is_correct set at submit time by comparing against question_options.is_correct
 * - For short answer: normalize student input (lowercase + trim) and compare
 *   against all question_accepted_answers
 */

import { normalizeText } from './normalize'
import type { SubmissionAnswer } from '@/types'

/**
 * Calculates the raw score from an array of submission answers.
 * raw_score = number of answers where is_correct = true
 *
 * @param answers - Array of submission answer rows (after is_correct is set)
 * @returns Raw score (integer)
 */
export function calculateRawScore(answers: Pick<SubmissionAnswer, 'is_correct'>[]): number {
  return answers.filter((a) => a.is_correct === true).length
}

/**
 * A parsed numeric answer.
 * `places` is the number of digits after the decimal point for a decimal literal,
 * or `null` when the answer is exact (an integer or an `a/b` fraction).
 */
interface NumericAnswer {
  value: number
  places: number | null
}

/**
 * Parses an SAT student-produced response into a numeric value, or returns null
 * when the text is not a plain number/fraction.
 *
 * Accepts: integers ("9"), decimals ("3.5", ".6666"), and fractions ("7/2").
 * Rejects (→ null, falls back to text comparison): anything containing a comma,
 * percent, or dollar sign, mixed numbers with an internal space ("3 1/2"), and
 * word/text answers. These mirror the on-screen grid-in directions.
 */
function parseNumericAnswer(raw: string): NumericAnswer | null {
  const s = raw.trim()
  if (!s) return null
  // Forbidden symbols / mixed-number spacing → not a valid grid-in number.
  if (/[,%$]/.test(s) || /\s/.test(s)) return null

  const frac = /^([+-]?\d+)\/([+-]?\d+)$/.exec(s)
  if (frac) {
    const numerator = Number(frac[1])
    const denominator = Number(frac[2])
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null
    }
    return { value: numerator / denominator, places: null }
  }

  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
    const value = Number(s)
    if (!Number.isFinite(value)) return null
    const dotIndex = s.indexOf('.')
    const places = dotIndex === -1 ? null : s.length - dotIndex - 1
    return { value, places }
  }

  return null
}

const NUMERIC_EPSILON = 1e-9
// SAT requires decimal answers to "fill the grid" — repeating/irrational values
// must be truncated or rounded to at least this many decimal places to earn
// credit (e.g. 2/3 → .6666/.6667/0.666/0.667 accepted, but .66/0.67 rejected).
const MIN_DECIMAL_PLACES = 3

/**
 * Compares two parsed numeric answers using SAT grid-in equivalence rules.
 * Handles exact equality (3.5 == 3.50 == 7/2, 2/3 == 4/6) and the
 * truncation/rounding rule for repeating decimals.
 */
function numericAnswersMatch(student: NumericAnswer, accepted: NumericAnswer): boolean {
  // Exact value equality covers terminating decimals and equivalent fractions.
  if (Math.abs(student.value - accepted.value) <= NUMERIC_EPSILON) return true

  // Values differ slightly → one side is a truncated/rounded decimal of a
  // repeating value. The exact side (fraction/integer) is the source of truth;
  // when both are decimals we treat the accepted answer as canonical.
  const studentExact = student.places === null
  const acceptedExact = accepted.places === null
  if (studentExact && acceptedExact) return false // two exact rationals that aren't equal

  const trueValue = acceptedExact ? accepted.value : student.value
  const entry = acceptedExact ? student : accepted
  const places = entry.places
  if (places === null || places < MIN_DECIMAL_PLACES) return false

  const factor = 10 ** places
  const truncated = Math.trunc(trueValue * factor) / factor
  const rounded = Math.round(trueValue * factor) / factor
  return (
    Math.abs(entry.value - truncated) <= NUMERIC_EPSILON ||
    Math.abs(entry.value - rounded) <= NUMERIC_EPSILON
  )
}

/**
 * Checks whether a student's short-answer text matches any accepted answer variant.
 *
 * When both the student input and an accepted answer parse as numbers, SAT
 * grid-in equivalence rules apply (3.5 == 3.50 == 7/2, 2/3 ≈ .6667, etc.) — see
 * `numericAnswersMatch`. Otherwise it falls back to normalized text comparison
 * so "8.0 " matches "8.0" and "FORTY-EIGHT" matches "forty-eight".
 *
 * @param studentAnswer - The raw text the student typed
 * @param acceptedAnswers - Array of accepted answer strings from question_accepted_answers
 * @returns true if the student's answer matches any accepted variant
 */
export function isShortAnswerCorrect(
  studentAnswer: string,
  acceptedAnswers: string[]
): boolean {
  const normalizedStudent = normalizeText(studentAnswer)
  const studentNum = parseNumericAnswer(studentAnswer)

  return acceptedAnswers.some((accepted) => {
    const acceptedNum = parseNumericAnswer(accepted)
    // Numeric answer key → grade with math, not string equality. The student
    // response must itself be a valid grid-in number and be mathematically
    // equivalent. We never fall back to the text path here, because
    // normalizeText strips punctuation and would wrongly accept forbidden forms
    // ("3,500" → "3500", "72" → "7/2"). A non-numeric student answer simply
    // fails against a numeric key.
    if (acceptedNum) {
      return studentNum ? numericAnswersMatch(studentNum, acceptedNum) : false
    }
    // Non-numeric answer key (e.g. "forty-eight") → normalized text comparison.
    return normalizeText(accepted) === normalizedStudent
  })
}

/**
 * Score summary returned after submission.
 * scaled_score is null until Phase 2 implements the SAT score conversion table.
 */
export interface ScoreSummary {
  rawScore: number
  totalQuestions: number
  scaledScore: null  // Phase 2
  percentageCorrect: number
}

/**
 * Builds a score summary from submission answers.
 *
 * @param answers - All submission answers for the submission
 * @returns ScoreSummary object
 */
export function buildScoreSummary(
  answers: Pick<SubmissionAnswer, 'is_correct'>[]
): ScoreSummary {
  const totalQuestions = answers.length
  const rawScore = calculateRawScore(answers)
  const percentageCorrect = totalQuestions > 0
    ? Math.round((rawScore / totalQuestions) * 100)
    : 0

  return {
    rawScore,
    totalQuestions,
    scaledScore: null,
    percentageCorrect,
  }
}

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
 * Checks whether a student's short-answer text matches any accepted answer variant.
 * Uses normalize() so "8.0 " matches "8.0" and "FORTY-EIGHT" matches "forty-eight".
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
  return acceptedAnswers.some(
    (accepted) => normalizeText(accepted) === normalizedStudent
  )
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

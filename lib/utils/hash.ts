/**
 * lib/utils/hash.ts
 * SHA256 content hash for question deduplication.
 *
 * Rule from CLAUDE.md:
 *   content_hash = SHA256(normalize(question_text + correct_answer))
 *
 * Used by:
 *   - lib/parsers/docx-parser.ts — generates hash for each parsed question
 *   - API routes — checks for existing question before INSERT
 */

import { createHash } from 'crypto'
import { normalizeText } from './normalize'

/**
 * Generates a SHA256 content hash for a question.
 * The hash is deterministic: same content always produces the same hash.
 *
 * @param questionText - The full question content (stem + passage if any)
 * @param correctAnswer - The correct answer text
 * @returns Hex-encoded SHA256 hash string
 */
export function generateContentHash(questionText: string, correctAnswer: string): string {
  const normalized = normalizeText(questionText + correctAnswer)
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Checks whether two questions are duplicates by comparing their content hashes.
 *
 * @param hashA - Content hash of the first question
 * @param hashB - Content hash of the second question
 * @returns true if the questions are duplicates
 */
export function areDuplicates(hashA: string, hashB: string): boolean {
  return hashA === hashB
}

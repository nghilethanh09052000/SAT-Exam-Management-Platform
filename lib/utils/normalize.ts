/**
 * lib/utils/normalize.ts
 * Text normalization for question deduplication.
 *
 * Used by: generateContentHash() in lib/utils/hash.ts
 * Rule from CLAUDE.md: normalize = lowercase + strip whitespace + strip punctuation
 */

/**
 * Normalizes text for content hash comparison.
 * - Converts to lowercase
 * - Strips all punctuation (keeps letters, digits, spaces)
 * - Collapses multiple whitespace into single space
 * - Trims leading/trailing whitespace
 *
 * @param text - Raw text to normalize
 * @returns Normalized string safe for hashing
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Strip all characters that are not alphanumeric or whitespace
    // Using ASCII-safe range + explicit Unicode ranges for broad letter coverage
    // eslint-disable-next-line no-control-regex
    .replace(/[^\w\s]/g, '')
    // Collapse multiple whitespace characters into a single space
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
}

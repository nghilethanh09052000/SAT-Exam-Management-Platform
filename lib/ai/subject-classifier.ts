/**
 * lib/ai/subject-classifier.ts
 *
 * AI-powered SAT question subject classifier (math vs reading_writing).
 *
 * Used by the worker when a .docx file has no module heading to indicate
 * which subject a question belongs to.  Falls back to rule-based heuristics
 * when the Anthropic API key is absent or the call fails — the import job
 * must never be blocked by an AI timeout.
 *
 * Model: claude-haiku-4-5-20251001  (fastest / cheapest, ample for this task)
 * Max tokens: 10  (we only need one word in the response)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Subject } from '@/lib/categorization/classifier'

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert SAT question classifier.
Your only task is to decide whether a question belongs to the "math" or "reading_writing" section of the SAT.

Rules:
- "math" covers: arithmetic, algebra, geometry, trigonometry, statistics, calculus-like reasoning, word problems with equations.
- "reading_writing" covers: reading comprehension, vocabulary in context, grammar, punctuation, rhetoric, evidence-based reading, writing style.

Respond with exactly one word: either  math  or  reading_writing  — nothing else.`

// ── Rule-based fallback ───────────────────────────────────────────────────────

const MATH_SIGNALS = [
  /\b(?:solve|equation|inequality|expression|function|graph|slope|intercept|variable|coefficient)\b/i,
  /\b(?:triangle|circle|angle|radius|diameter|area|perimeter|volume|surface area)\b/i,
  /\b(?:probability|percentage|ratio|proportion|mean|median|mode|average|standard deviation)\b/i,
  /[=+\-*/^√∑∫].*\d|\d.*[=+\-*/^√∑∫]/,   // expressions with operators + digits
  /\bf\s*\(\s*x\s*\)/i,                      // f(x)
  /\b(?:quadratic|polynomial|exponential|logarithm|exponent)\b/i,
  /\b(?:integer|prime|factor|multiple|divisible)\b/i,
]

function rulesBasedSubject(text: string): Subject {
  const hits = MATH_SIGNALS.filter((rx) => rx.test(text)).length
  return hits >= 2 ? 'math' : 'reading_writing'
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Classify a question's subject using the Claude API.
 *
 * Returns 'math' | 'reading_writing'.
 *
 * Always safe to call — falls back to rule-based heuristics when:
 *  - ANTHROPIC_API_KEY is not set
 *  - The API call fails for any reason
 *  - The model returns an unexpected response
 */
export async function classifySubjectWithAI(questionContent: string): Promise<Subject> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // No key configured — silently use rule-based fallback
    return rulesBasedSubject(questionContent)
  }

  try {
    const client = new Anthropic({ apiKey })

    // Trim to 2000 chars — the classifier only needs context clues, not the full passage
    const text = questionContent.replace(/<[^>]+>/g, ' ').slice(0, 2000).trim()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    })

    const raw = response.content[0]?.type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : ''

    if (raw === 'math') return 'math'
    if (raw === 'reading_writing') return 'reading_writing'

    // Unexpected response — fall through to rule-based
    console.warn('[subject-classifier] Unexpected AI response:', raw)
  } catch (err) {
    console.error('[subject-classifier] AI call failed, using rule-based fallback:', err instanceof Error ? err.message : err)
  }

  return rulesBasedSubject(questionContent)
}

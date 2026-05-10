/**
 * lib/ai/tag-suggester.ts
 * Suggests skill tags for a parsed SAT question using Claude API.
 *
 * Called once per question during the upload review step.
 * Teacher reviews and confirms or changes the AI suggestion before saving.
 *
 * Model: claude-sonnet-4-20250514
 * Max tokens: 500 (structured output — short response)
 *
 * ─── COMMENTED OUT — ANTHROPIC_API_KEY not configured yet ───────────────────
 * Uncomment everything below once ANTHROPIC_API_KEY is set in .env.local
 * and import Anthropic from '@anthropic-ai/sdk'
 * ─────────────────────────────────────────────────────────────────────────────
 */

// import Anthropic from '@anthropic-ai/sdk'
import type { TagSuggestion, SubjectType, QuestionDifficulty } from '@/types'

/**
 * Input to the tag suggester.
 */
export interface TagSuggesterInput {
  /** Full question content including passage text */
  questionContent: string
  /** The question stem (the actual question asked) */
  questionStem: string
  /** Answer options (for multiple choice) — helps determine subject/skill */
  options?: string[]
  /** Correct answer text — helps determine skill */
  correctAnswer: string
  /** Module context — e.g. "Module 1: Reading and Writing" */
  module: string
}

/**
 * Suggests subject, skill tag, and difficulty for a question.
 *
 * Always wrap in try/catch when calling — AI failures must not block the upload flow.
 *
 * @param input - Question data to analyze
 * @returns TagSuggestion or null if the API call fails
 */
export async function suggestTags(_input: TagSuggesterInput): Promise<TagSuggestion | null> {
  // ─── COMMENTED OUT — enable once ANTHROPIC_API_KEY is ready ───────────────
  //
  // if (!process.env.ANTHROPIC_API_KEY) {
  //   console.warn('[tag-suggester] ANTHROPIC_API_KEY not set — skipping AI tag suggestion')
  //   return null
  // }
  //
  // try {
  //   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  //   const prompt = buildTagSuggestionPrompt(_input)
  //   const response = await client.messages.create({
  //     model: 'claude-sonnet-4-20250514',
  //     max_tokens: 500,
  //     messages: [{ role: 'user', content: prompt }],
  //   })
  //   const text = response.content[0].type === 'text' ? response.content[0].text : ''
  //   return parseTagResponse(text)
  // } catch (error) {
  //   console.error('[tag-suggester] AI call failed:', error)
  //   return null
  // }
  // ──────────────────────────────────────────────────────────────────────────

  return null
}

/**
 * Builds the prompt for tag suggestion.
 * Uncomment the call in suggestTags() once ANTHROPIC_API_KEY is ready.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildTagSuggestionPrompt(input: TagSuggesterInput): string {
  const subjectHint = input.module.toLowerCase().includes('math') ? 'Math' : 'Reading & Writing'

  return `You are analyzing an SAT question. Classify it with the most appropriate skill tag.

Subject (based on module): ${subjectHint}

Question:
${input.questionStem}

${input.options ? `Options:\n${input.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}` : ''}

Correct answer: ${input.correctAnswer}

Available tags for Reading & Writing:
- Words in Context, Punctuation, Subject-Verb Agreement, Logical Transition,
  Central Ideas, Command of Evidence, Cross-text Connections, Rhetorical Synthesis,
  Transitions, Form Structure and Sense, Boundaries

Available tags for Math:
- Linear Equations, Quadratic Functions, Geometry Circles, Data Analysis,
  Systems of Equations, Inequalities, Percentages, Ratios, Statistics,
  Exponential Functions, Trigonometry, Complex Numbers

Respond in JSON only:
{
  "subject": "reading_writing" | "math",
  "skillTag": "<one of the tags listed above>",
  "difficulty": "easy" | "medium" | "hard"
}`
}

/**
 * Parses the AI JSON response into a TagSuggestion.
 * TODO: Implement once API key is available.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseTagResponse(text: string): TagSuggestion | null {
  try {
    const json = JSON.parse(text.trim())
    return {
      subject: json.subject as SubjectType,
      skillTag: json.skillTag as string,
      difficulty: (json.difficulty ?? null) as QuestionDifficulty | null,
    }
  } catch {
    return null
  }
}

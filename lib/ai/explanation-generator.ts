/**
 * lib/ai/explanation-generator.ts
 * Generates an explanation for an SAT question in the teacher's style.
 *
 * Generated ONCE per question and cached in questions.ai_explanation.
 * Never called per student submission — only called during upload review
 * or when the teacher explicitly requests an AI explanation.
 *
 * Model: claude-sonnet-4-20250514
 * Max tokens: 1000
 * Style: few-shot prompting with teacher's own explanation examples.
 *
 * ─── COMMENTED OUT — ANTHROPIC_API_KEY not configured yet ───────────────────
 * Uncomment everything below once ANTHROPIC_API_KEY is set in .env.local
 * and import Anthropic from '@anthropic-ai/sdk'
 * ─────────────────────────────────────────────────────────────────────────────
 */

// import Anthropic from '@anthropic-ai/sdk'

/**
 * Input to the explanation generator.
 */
export interface ExplanationInput {
  /** Full question content (passage + stem) */
  questionContent: string
  /** The correct answer text */
  correctAnswer: string
  /** For multiple choice: all options with labels */
  options?: Array<{ label: string; content: string; isCorrect: boolean }>
  /** Teacher-written explanation examples for few-shot prompting */
  teacherExamples?: TeacherExample[]
}

/**
 * A teacher-written explanation example used for few-shot prompting.
 * Collect these from questions where the teacher has written explanations.
 */
export interface TeacherExample {
  questionContent: string
  correctAnswer: string
  teacherExplanation: string
}

/**
 * Generates an AI explanation for a question in the teacher's voice.
 *
 * Always wrap in try/catch when calling — AI failures must not block the upload flow.
 *
 * @param input - Question data and teacher examples for few-shot prompting
 * @returns Explanation text string, or null if the API call fails
 */
export async function generateExplanation(_input: ExplanationInput): Promise<string | null> {
  // ─── COMMENTED OUT — enable once ANTHROPIC_API_KEY is ready ───────────────
  //
  // if (!process.env.ANTHROPIC_API_KEY) {
  //   console.warn('[explanation-generator] ANTHROPIC_API_KEY not set')
  //   return null
  // }
  //
  // try {
  //   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  //   const prompt = buildExplanationPrompt(_input)
  //   const response = await client.messages.create({
  //     model: 'claude-sonnet-4-20250514',
  //     max_tokens: 1000,
  //     messages: [{ role: 'user', content: prompt }],
  //   })
  //   return response.content[0].type === 'text' ? response.content[0].text.trim() : null
  // } catch (error) {
  //   console.error('[explanation-generator] AI call failed:', error)
  //   return null
  // }
  // ──────────────────────────────────────────────────────────────────────────

  return null
}

/**
 * Builds a few-shot prompt for explanation generation.
 * Uses teacher-written examples to match the teacher's voice and format.
 * Uncomment the call in generateExplanation() once ANTHROPIC_API_KEY is ready.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildExplanationPrompt(input: ExplanationInput): string {
  const examplesSection =
    input.teacherExamples && input.teacherExamples.length > 0
      ? input.teacherExamples
          .map(
            (ex, i) => `
Example ${i + 1}:
Question: ${ex.questionContent}
Correct answer: ${ex.correctAnswer}
Teacher explanation: ${ex.teacherExplanation}`
          )
          .join('\n')
      : ''

  const optionsSection =
    input.options && input.options.length > 0
      ? `\nAnswer choices:\n${input.options.map((o) => `${o.label}) ${o.content}${o.isCorrect ? ' ✓ CORRECT' : ''}`).join('\n')}`
      : ''

  return `You are writing SAT question explanations in the style of an experienced Vietnamese SAT teacher.
The explanation should be clear, educational, and match the style of the examples below.
Write in Vietnamese or English as appropriate — use the same language as the examples.

${examplesSection ? `Here are examples of the teacher's explanation style:\n${examplesSection}\n\n` : ''}Now write an explanation for this question:
Question: ${input.questionContent}
${optionsSection}
Correct answer: ${input.correctAnswer}

Write only the explanation text — no preamble, no JSON wrapping.`
}

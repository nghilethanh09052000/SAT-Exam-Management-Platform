/**
 * lib/ai/explanation-generator.ts
 * Generates an explanation for an SAT question in the teacher's style.
 *
 * Generated ONCE per question and cached in questions.ai_explanation.
 * Never called per student submission — only called during upload review
 * or when the teacher explicitly requests an AI explanation.
 *
 * Model: DeepSeek chat completions
 * Max tokens: 1000
 * Style: few-shot prompting with teacher's own explanation examples.
 */

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

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
  error?: {
    message?: string
    code?: string
  }
}

export type ExplanationResult =
  | { ok: true; explanation: string }
  | { ok: false; error: string; status?: number }

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
export async function generateExplanation(input: ExplanationInput): Promise<string | null> {
  const result = await generateExplanationResult(input)
  return result.ok ? result.explanation : null
}

export async function generateExplanationResult(input: ExplanationInput): Promise<ExplanationResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('[explanation-generator] DEEPSEEK_API_KEY not set')
    return { ok: false, error: 'DEEPSEEK_API_KEY is not configured.' }
  }

  const apiBaseUrl = process.env.DEEPSEEK_API_BASE_URL ?? 'https://api.deepseek.com'
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You write concise, accurate SAT question explanations for teachers. Return only the explanation text.',
          },
          { role: 'user', content: buildExplanationPrompt(input) },
        ],
      }),
    })

    const json = (await response.json().catch(() => null)) as DeepSeekChatResponse | null
    if (!response.ok) {
      const message = json?.error?.message ?? response.statusText
      console.error('[explanation-generator] DeepSeek call failed:', message)
      return { ok: false, error: `DeepSeek error: ${message}`, status: response.status }
    }

    const explanation = json?.choices?.[0]?.message?.content?.trim()
    if (!explanation) {
      return { ok: false, error: 'DeepSeek returned an empty explanation.' }
    }

    return { ok: true, explanation }
  } catch (error) {
    console.error('[explanation-generator] AI call failed:', error)
    return { ok: false, error: 'Could not connect to DeepSeek.' }
  }
}

/**
 * Builds a few-shot prompt for explanation generation.
 * Uses teacher-written examples to match the teacher's voice and format.
 */
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

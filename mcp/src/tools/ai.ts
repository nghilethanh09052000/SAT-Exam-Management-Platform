/**
 * mcp/src/tools/ai.ts
 *
 * MCP tools that wrap the platform's AI features — powered by DeepSeek.
 *
 * DeepSeek exposes an OpenAI-compatible API, so we use the `openai` package
 * with a custom baseURL. Set DEEPSEEK_API_KEY in your environment.
 *
 * Models used:
 *   deepseek-chat  — DeepSeek-V3 (fast, cheap, great quality for these tasks)
 *
 * Pricing (as of 2025):
 *   ~$0.27 / 1M input tokens  |  ~$1.10 / 1M output tokens  (cache miss)
 *   ~$0.07 / 1M input tokens  |  ~$1.10 / 1M output tokens  (cache hit)
 *
 * Tools:
 *   - classify_question_subject  — math vs reading_writing
 *   - suggest_question_tags      — subject + skill tag + difficulty
 *   - generate_explanation       — teacher-quality explanation for a question
 */

import OpenAI from 'openai'
import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ClassifySubjectInput = z.object({
  content: z.string().min(1).describe('Full question content (HTML or plain text)'),
})

export const SuggestTagsInput = z.object({
  content:        z.string().min(1).describe('Full question content'),
  question_stem:  z.string().optional().describe('Explicit question stem if available'),
  options:        z.array(z.string()).optional().describe('Answer option texts'),
  correct_answer: z.string().optional().describe('Correct answer text'),
  module:         z.string().optional().describe('Module context, e.g. "Module 1: Reading and Writing"'),
})

export const GenerateExplanationInput = z.object({
  question_id:    z.string().optional().describe('Look up question from DB by UUID'),
  content:        z.string().optional().describe('Question content (use if no question_id)'),
  correct_answer: z.string().optional().describe('The correct answer'),
  subject:        z.enum(['math', 'reading_writing']).optional(),
})

// ─── Client factory ──────────────────────────────────────────────────────────

function getClient(): OpenAI | null {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  return new OpenAI({
    apiKey:  key,
    baseURL: 'https://api.deepseek.com',
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Rule-based math-signal fallback (used when no API key is set)
const MATH_SIGNALS = [
  /\b(?:solve|equation|inequality|expression|function|graph|slope|intercept|variable|coefficient)\b/i,
  /\b(?:triangle|circle|angle|radius|diameter|area|perimeter|volume)\b/i,
  /\b(?:probability|percentage|ratio|proportion|mean|median|mode|average)\b/i,
  /[=+\-*/^√∑].*\d|\d.*[=+\-*/^√∑]/,
  /\bf\s*\(\s*x\s*\)/i,
  /\b(?:quadratic|polynomial|exponential|logarithm|exponent)\b/i,
]

// ─── Tool implementations ────────────────────────────────────────────────────

export async function classifySubject(input: z.infer<typeof ClassifySubjectInput>) {
  const text = stripHtml(input.content).slice(0, 2000)
  const client = getClient()

  if (!client) {
    // No API key — fall back to rule-based heuristics
    const hits = MATH_SIGNALS.filter(rx => rx.test(text)).length
    return {
      data: { subject: hits >= 2 ? 'math' : 'reading_writing', method: 'rule-based' },
      error: null,
    }
  }

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 10,
    messages: [
      {
        role: 'system',
        content: `You are an expert SAT question classifier.
Decide whether a question belongs to "math" or "reading_writing".
- math: arithmetic, algebra, geometry, statistics, word problems with equations.
- reading_writing: comprehension, vocabulary, grammar, rhetoric, writing style.
Respond with exactly one word: math or reading_writing.`,
      },
      { role: 'user', content: text },
    ],
  })

  const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? ''
  const subject =
    raw === 'math'             ? 'math'
    : raw === 'reading_writing' ? 'reading_writing'
    : MATH_SIGNALS.filter(rx => rx.test(text)).length >= 2 ? 'math' : 'reading_writing'

  return { data: { subject, method: 'ai', raw_response: raw }, error: null }
}

export async function suggestTags(input: z.infer<typeof SuggestTagsInput>) {
  const client = getClient()
  if (!client) return { error: 'DEEPSEEK_API_KEY not configured' }

  const text = stripHtml(input.content).slice(0, 3000)
  const optionsText = (input.options ?? []).join('\n')

  const prompt = `Analyze this SAT question and return JSON with these fields:
- subject: "math" or "reading_writing"
- skill_tag: a concise skill label (e.g. "Linear Equations", "Vocabulary in Context", "Command of Evidence")
- difficulty: "easy", "medium", or "hard"

Question:
${text}

${input.question_stem  ? `Question stem: ${input.question_stem}`  : ''}
${optionsText          ? `Options:\n${optionsText}`                : ''}
${input.correct_answer ? `Correct answer: ${input.correct_answer}` : ''}
${input.module         ? `Module: ${input.module}`                 : ''}

Respond ONLY with valid JSON matching: {"subject": "...", "skill_tag": "...", "difficulty": "..."}`

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? ''

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw)
    return { data: parsed, error: null }
  } catch {
    return { error: `Could not parse AI response: ${raw}` }
  }
}

export async function generateExplanation(
  db: AdminClient,
  input: z.infer<typeof GenerateExplanationInput>,
) {
  const client = getClient()
  if (!client) return { error: 'DEEPSEEK_API_KEY not configured' }

  let content = input.content ?? ''
  let correctAnswer = input.correct_answer ?? ''
  let subject = input.subject

  // Fetch from DB when question_id is provided
  if (input.question_id) {
    const { data: q, error } = await db
      .from('questions')
      .select('content, subject, question_options(label, content, is_correct), question_accepted_answers(answer_text)')
      .eq('id', input.question_id)
      .single()

    if (error) return { error: error.message }

    const qData = q as any
    content = qData.content ?? ''
    subject  = qData.subject ?? subject

    const correctOption = (qData.question_options ?? []).find((o: any) => o.is_correct)
    if (correctOption) correctAnswer = `${correctOption.label}. ${correctOption.content}`

    const acceptedAnswers = (qData.question_accepted_answers ?? []).map((a: any) => a.answer_text)
    if (acceptedAnswers.length > 0 && !correctAnswer) correctAnswer = acceptedAnswers.join(', ')
  }

  const subjectContext = subject === 'math'
    ? 'This is a Math SAT question. Show clear step-by-step mathematical reasoning.'
    : 'This is a Reading & Writing SAT question. Explain the key concept and why the answer is correct.'

  const prompt = `You are an expert SAT tutor. Write a clear, student-friendly explanation for this question.

${subjectContext}

Question:
${stripHtml(content).slice(0, 3000)}

${correctAnswer ? `Correct Answer: ${correctAnswer}` : ''}

Provide:
1. Why the correct answer is right
2. Why common wrong answers are wrong (if multiple choice)
3. The underlying concept or strategy to remember

Keep it concise (under 300 words), clear, and encouraging.`

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const explanation = response.choices[0]?.message?.content ?? ''

  // Save back to DB when question_id was provided
  if (input.question_id && explanation) {
    await db
      .from('questions')
      .update({ ai_explanation: explanation })
      .eq('id', input.question_id)
  }

  return { data: { explanation, saved: Boolean(input.question_id) }, error: null }
}

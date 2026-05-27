/**
 * mcp/src/tools/questions.ts
 *
 * MCP tools for Question Bank management:
 *   - list_questions   — paginated, filterable list
 *   - get_question     — full detail with options, tags, accepted answers
 *   - create_question  — insert a new question (MC or short-answer)
 *   - search_questions — full-text search via the search_questions RPC
 */

import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ListQuestionsInput = z.object({
  subject: z.enum(['math', 'reading_writing']).optional().describe('Filter by SAT subject'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().describe('Filter by difficulty level'),
  type: z.enum(['multiple_choice', 'short_answer']).optional().describe('Filter by question type'),
  tag_id: z.string().optional().describe('Filter by a specific tag UUID'),
  limit: z.number().int().min(1).max(100).default(20).describe('Number of questions to return (max 100)'),
  after_created_at: z.string().optional().describe('Cursor — created_at of the last item for pagination'),
  after_id: z.string().optional().describe('Cursor — id of the last item for pagination'),
})

export const GetQuestionInput = z.object({
  id: z.string().describe('Question UUID'),
})

export const SearchQuestionsInput = z.object({
  query: z.string().min(1).describe('Full-text search query'),
  subject: z.enum(['math', 'reading_writing']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  type: z.enum(['multiple_choice', 'short_answer']).optional(),
  limit: z.number().int().min(1).max(200).default(20),
})

export const CreateQuestionInput = z.object({
  type: z.enum(['multiple_choice', 'short_answer']).describe('Question type'),
  content: z.string().min(1).describe('Full question HTML/text content'),
  stimulus: z.string().nullable().optional().describe('Reading passage or context (optional)'),
  prompt: z.string().nullable().optional().describe('The explicit question stem (optional)'),
  subject: z.enum(['math', 'reading_writing']).nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  content_hash: z.string().describe('SHA-256 hash of content to prevent duplicates'),
  teacher_explanation: z.string().nullable().optional().describe('Teacher-written explanation'),
  options: z.array(z.object({
    label: z.string().describe('Option label: A, B, C, or D'),
    content: z.string().describe('Option text content'),
    is_correct: z.boolean(),
    order: z.number().int(),
  })).optional().describe('Answer options (required for multiple_choice)'),
  accepted_answers: z.array(z.string()).optional().describe('Accepted answers (for short_answer)'),
  tag_ids: z.array(z.string()).optional().describe('Tag UUIDs to attach'),
  created_by: z.string().describe('UUID of the teacher creating this question'),
})

// ─── Tool implementations ────────────────────────────────────────────────────

export async function listQuestions(db: AdminClient, input: z.infer<typeof ListQuestionsInput>) {
  const { subject, difficulty, type, tag_id, limit, after_created_at, after_id } = input
  const pageSize = limit

  let query = db
    .from('questions')
    .select(
      tag_id
        ? 'id, type, subject, content_preview, difficulty, created_at, question_tags!inner(tags(id, name, subject))'
        : 'id, type, subject, content_preview, difficulty, created_at, question_tags(tags(id, name, subject))'
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1)

  if (type)       query = query.eq('type',       type)
  if (difficulty) query = query.eq('difficulty', difficulty)
  if (subject)    query = query.eq('subject',    subject)
  if (tag_id)     query = (query as any).eq('question_tags.tag_id', tag_id)

  if (after_created_at && after_id) {
    query = query.or(
      `created_at.lt.${after_created_at},and(created_at.eq.${after_created_at},id.lt.${after_id})`
    )
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  const rows = (data ?? []) as any[]
  const hasNext = rows.length > pageSize
  const page = rows.slice(0, pageSize).map((q) => ({
    id:              q.id,
    type:            q.type,
    subject:         q.subject ?? null,
    content_preview: q.content_preview ?? '',
    difficulty:      q.difficulty,
    created_at:      q.created_at,
    tags: (q.question_tags ?? [])
      .map((qt: any) => qt.tags)
      .filter(Boolean),
  }))

  return { data: page, has_next: hasNext, error: null }
}

export async function getQuestion(db: AdminClient, input: z.infer<typeof GetQuestionInput>) {
  const { id } = input

  const { data, error } = await db
    .from('questions')
    .select(`
      id, type, subject, content, content_preview, stimulus, prompt,
      difficulty, teacher_explanation, ai_explanation, content_hash,
      created_at, updated_at, created_by,
      question_options(id, label, content, is_correct, order),
      question_accepted_answers(id, answer_text),
      question_tags(tags(id, name, subject))
    `)
    .eq('id', id)
    .is('archived_at', null)
    .single()

  if (error) return { error: error.message }

  const tags = ((data as any).question_tags ?? [])
    .map((qt: any) => qt.tags)
    .filter(Boolean)

  return {
    data: {
      ...data,
      question_tags: undefined,
      tags,
    },
    error: null,
  }
}

export async function searchQuestions(db: AdminClient, input: z.infer<typeof SearchQuestionsInput>) {
  const { query, subject, difficulty, type, limit } = input

  const { data, error } = await (db as any).rpc('search_questions', {
    p_search:           query,
    p_type:             type       ?? null,
    p_difficulty:       difficulty ?? null,
    p_tag_id:           null,
    p_subject:          subject    ?? null,
    p_after_created_at: null,
    p_after_id:         null,
    p_limit:            limit,
  })

  if (error) return { error: error.message }

  return { data: data ?? [], error: null }
}

export async function createQuestion(db: AdminClient, input: z.infer<typeof CreateQuestionInput>) {
  const { options, accepted_answers, tag_ids, created_by, ...questionData } = input

  const { data: question, error: qError } = await db
    .from('questions')
    .insert({ ...questionData, created_by })
    .select('id, content_preview, subject, difficulty')
    .single()

  if (qError) return { error: qError.message }

  const qid = (question as any).id

  if (options && options.length > 0) {
    const { error } = await db
      .from('question_options')
      .insert(options.map((o) => ({ ...o, question_id: qid })))
    if (error) return { error: error.message }
  }

  if (accepted_answers && accepted_answers.length > 0) {
    const { error } = await db
      .from('question_accepted_answers')
      .insert(accepted_answers.map((a) => ({ question_id: qid, answer_text: a })))
    if (error) return { error: error.message }
  }

  if (tag_ids && tag_ids.length > 0) {
    const { error } = await db
      .from('question_tags')
      .insert(tag_ids.map((tid) => ({ question_id: qid, tag_id: tid })))
    if (error) return { error: error.message }
  }

  return { data: question, error: null }
}

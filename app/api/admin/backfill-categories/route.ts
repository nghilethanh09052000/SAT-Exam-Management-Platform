/**
 * POST /api/admin/backfill-categories
 * Admin-only: classify all questions that have no skill tag yet.
 */

import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/with-auth'
import { classifyQuestion, subjectFromModule } from '@/lib/categorization/classifier'

export const runtime = 'nodejs'
export const maxDuration = 300

export const POST = withAdmin(async (_request, { db }) => {
  const raw = db as any

  const { data: tags, error: tagsError } = await raw.from('tags').select('id, subject, name')
  if (tagsError || !tags) {
    return NextResponse.json({ data: null, error: 'Không thể tải danh sách tag.' }, { status: 500 })
  }

  const tagLookup = new Map<string, string>()
  for (const tag of tags) {
    tagLookup.set(normalizeKey(tag.subject, tag.name), tag.id)
  }

  const { data: taggedIds } = await raw.from('question_tags').select('question_id')
  const taggedSet = new Set((taggedIds ?? []).map((r: { question_id: string }) => r.question_id))

  const { data: questions, error: qError } = await raw
    .from('questions')
    .select('id, content')
    .is('archived_at', null)
  if (qError || !questions) {
    return NextResponse.json({ data: null, error: 'Không thể tải câu hỏi.' }, { status: 500 })
  }

  const untagged = questions.filter((q: { id: string }) => !taggedSet.has(q.id))
  if (untagged.length === 0) {
    return NextResponse.json({ data: { total: 0, tagged: 0, skipped: 0, low_confidence: 0 }, error: null })
  }

  const questionIds = untagged.map((q: { id: string }) => q.id)
  const { data: aqRows } = await raw.from('assignment_questions').select('question_id, module').in('question_id', questionIds)
  const { data: epqRows } = await raw.from('exam_paper_questions').select('question_id, module_name').in('question_id', questionIds)

  const moduleMap = new Map<string, string>()
  for (const r of (aqRows ?? []) as { question_id: string; module: string }[]) {
    if (!moduleMap.has(r.question_id)) moduleMap.set(r.question_id, r.module)
  }
  for (const r of (epqRows ?? []) as { question_id: string; module_name: string }[]) {
    if (!moduleMap.has(r.question_id)) moduleMap.set(r.question_id, r.module_name)
  }

  let tagged = 0, skipped = 0, lowConfidence = 0

  for (const q of untagged as { id: string; content: string }[]) {
    const module = moduleMap.get(q.id) ?? ''
    const subject = subjectFromModule(module)
    const primary   = classifyQuestion(q.content, subject)
    const altSubj   = subject === 'math' ? 'reading_writing' : 'math'
    const alternate = classifyQuestion(q.content, altSubj)
    const best = alternate.score > primary.score ? alternate : primary
    const resolvedSubject = alternate.score > primary.score ? altSubj : subject

    if (best.category === 'Uncategorized') { skipped++; continue }

    const tagId = tagLookup.get(normalizeKey(resolvedSubject, best.category))
    if (!tagId) { skipped++; continue }

    const { error: insertError } = await raw.from('question_tags').insert({
      question_id: q.id,
      tag_id: tagId,
      confidence: best.confidence,
    })

    if (!insertError) {
      if (best.confidence === 'low') lowConfidence++
      else tagged++
    } else {
      skipped++
    }
  }

  return NextResponse.json({ data: { total: untagged.length, tagged, skipped, low_confidence: lowConfidence }, error: null })
})

function normalizeKey(subject: string, name: string): string {
  return `${subject}:${name
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()}`
}

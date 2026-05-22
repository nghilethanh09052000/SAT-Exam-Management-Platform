/**
 * POST /api/admin/backfill-categories
 * Admin-only: classify all questions that have no skill tag yet.
 *
 * Iterates over all active questions without a question_tag row, runs the
 * rule-based classifier, and inserts matching tags. Low-confidence results
 * are stored with confidence='low' so teachers can review them.
 *
 * This is a one-time / on-demand operation — not called per request.
 *
 * Response:
 *   { data: { total, tagged, skipped, low_confidence }, error: null }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthenticatedProfile } from '@/lib/authz'
import { classifyQuestion, subjectFromModule } from '@/lib/categorization/classifier'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 300  // long-running batch job

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawClient(): any {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { user, profile } = await getAuthenticatedProfile(supabase)

  if (!user) {
    return NextResponse.json({ data: null, error: 'Chưa đăng nhập.' }, { status: 401 })
  }
  if (profile?.role !== 'admin') {
    return NextResponse.json({ data: null, error: 'Chỉ admin mới có quyền thực hiện hành động này.' }, { status: 403 })
  }

  const raw = rawClient()

  // ── Load all canonical tags ───────────────────────────────────────────────
  const { data: tags, error: tagsError } = await raw
    .from('tags')
    .select('id, subject, name')

  if (tagsError || !tags) {
    return NextResponse.json({ data: null, error: 'Không thể tải danh sách tag.' }, { status: 500 })
  }

  const tagLookup = new Map<string, string>()
  for (const tag of tags) {
    tagLookup.set(normalizeKey(tag.subject, tag.name), tag.id)
  }

  // ── Load all questions that have no tag yet ───────────────────────────────
  // Use a LEFT JOIN via subquery — fetch questions whose IDs are NOT in question_tags
  const { data: taggedIds } = await raw
    .from('question_tags')
    .select('question_id')

  const taggedSet = new Set((taggedIds ?? []).map((r: { question_id: string }) => r.question_id))

  const { data: questions, error: qError } = await raw
    .from('questions')
    .select('id, content')
    .is('archived_at', null)

  if (qError || !questions) {
    return NextResponse.json({ data: null, error: 'Không thể tải câu hỏi.' }, { status: 500 })
  }

  const untagged = questions.filter((q: { id: string; content: string }) => !taggedSet.has(q.id))

  if (untagged.length === 0) {
    return NextResponse.json({
      data: { total: 0, tagged: 0, skipped: 0, low_confidence: 0 },
      error: null,
    })
  }

  // ── Also fetch module info from assignment_questions & exam_paper_questions ─
  const questionIds = untagged.map((q: { id: string }) => q.id)

  const { data: aqRows } = await raw
    .from('assignment_questions')
    .select('question_id, module')
    .in('question_id', questionIds)

  const { data: epqRows } = await raw
    .from('exam_paper_questions')
    .select('question_id, module_name')
    .in('question_id', questionIds)

  const moduleMap = new Map<string, string>()
  for (const r of (aqRows ?? []) as { question_id: string; module: string }[]) {
    if (!moduleMap.has(r.question_id)) moduleMap.set(r.question_id, r.module)
  }
  for (const r of (epqRows ?? []) as { question_id: string; module_name: string }[]) {
    if (!moduleMap.has(r.question_id)) moduleMap.set(r.question_id, r.module_name)
  }

  // ── Classify and insert ───────────────────────────────────────────────────
  let tagged = 0
  let skipped = 0
  let lowConfidence = 0

  for (const q of untagged as { id: string; content: string }[]) {
    const module = moduleMap.get(q.id) ?? ''
    const subject = subjectFromModule(module)

    // Try the known subject first; if score is low, try the other subject too
    const primaryResult = classifyQuestion(q.content, subject)
    const alternateSubject = subject === 'math' ? 'reading_writing' : 'math'
    const alternateResult  = classifyQuestion(q.content, alternateSubject)

    // Pick whichever subject scored higher
    const best = alternateResult.score > primaryResult.score ? alternateResult : primaryResult

    if (best.category === 'Uncategorized') {
      skipped++
      continue
    }

    // Low-confidence: still insert but flag for teacher review
    if (best.confidence === 'low') {
      skipped++
      const resolvedSubject = alternateResult.score > primaryResult.score ? alternateSubject : subject
      const tagId = tagLookup.get(normalizeKey(resolvedSubject, best.category))
      if (tagId) {
        const { error: lcErr } = await raw.from('question_tags').insert({
          question_id: q.id,
          tag_id: tagId,
          confidence: 'low',
        })
        if (!lcErr) lowConfidence++
      }
      continue
    }

    const resolvedSubject = alternateResult.score > primaryResult.score ? alternateSubject : subject
    const tagId = tagLookup.get(normalizeKey(resolvedSubject, best.category))
    if (!tagId) {
      skipped++
      continue
    }

    const { error: insertError } = await raw.from('question_tags').insert({
      question_id: q.id,
      tag_id: tagId,
      confidence: best.confidence,
    })

    if (!insertError) {
      tagged++
    } else {
      skipped++
    }
  }

  return NextResponse.json({
    data: {
      total: untagged.length,
      tagged,
      skipped,
      low_confidence: lowConfidence,
    },
    error: null,
  })
}

function normalizeKey(subject: string, name: string): string {
  return `${subject}:${name
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()}`
}

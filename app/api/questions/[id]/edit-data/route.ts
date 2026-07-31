import { NextResponse } from 'next/server'
import { assertTeacherOwnsQuestion, requirePermission } from '@/lib/authz'
import { withTeacher } from '@/lib/with-auth'

export const GET = withTeacher<{ id: string }>(async (
  _req,
  { user, profile, db, params }
) => {
  const cap = requirePermission({ profile }, 'questions:update')
  if (!cap.ok) {
    return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })
  }

  const authz = await assertTeacherOwnsQuestion({ user, profile, db }, params.id)
  if (!authz.ok) {
    return NextResponse.json({ data: null, error: authz.error }, { status: authz.status })
  }

  const [questionResult, optionsResult, answersResult, tagsResult, questionTagsResult] =
    await Promise.all([
      db
        .from('questions')
        .select('id, type, content, stimulus, prompt, subject, difficulty, teacher_explanation, ai_explanation')
        .eq('id', params.id)
        .single(),
      db
        .from('question_options')
        .select('id, label, content, is_correct, order')
        .eq('question_id', params.id)
        .order('order'),
      db
        .from('question_accepted_answers')
        .select('id, answer_text')
        .eq('question_id', params.id),
      db.from('tags').select('id, subject, name').order('subject').order('name'),
      db.from('question_tags').select('tag_id').eq('question_id', params.id),
    ])

  const firstError = [
    questionResult.error,
    optionsResult.error,
    answersResult.error,
    tagsResult.error,
    questionTagsResult.error,
  ].find(Boolean)

  if (firstError) {
    return NextResponse.json(
      { data: null, error: 'Failed to load question editor data' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      question: questionResult.data,
      options: optionsResult.data ?? [],
      accepted_answers: answersResult.data ?? [],
      tags: tagsResult.data ?? [],
      tag_ids: (questionTagsResult.data ?? []).map((row) => row.tag_id),
    },
    error: null,
  })
})

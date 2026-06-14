import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeacher } from '@/lib/with-auth'
import { requirePermission } from '@/lib/authz'
import { generateExplanationResult, type TeacherExample } from '@/lib/ai/explanation-generator'

const OptionSchema = z.object({
  label: z.string(),
  content: z.string(),
  is_correct: z.boolean(),
})

const GenerateExplanationSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['multiple_choice', 'short_answer']),
  options: z.array(OptionSchema).optional(),
  accepted_answers: z.array(z.string()).optional(),
})

type ExampleRow = {
  content: string
  teacher_explanation: string | null
  question_options?: Array<{ content: string; is_correct: boolean }> | null
  question_accepted_answers?: Array<{ answer_text: string }> | null
}

function getCorrectAnswer(input: z.infer<typeof GenerateExplanationSchema>) {
  if (input.type === 'multiple_choice') {
    return input.options?.find((option) => option.is_correct)?.content?.trim() ?? ''
  }
  return input.accepted_answers?.find((answer) => answer.trim())?.trim() ?? ''
}

function getExampleCorrectAnswer(example: ExampleRow) {
  return (
    example.question_options?.find((option) => option.is_correct)?.content?.trim() ||
    example.question_accepted_answers?.find((answer) => answer.answer_text.trim())?.answer_text.trim() ||
    ''
  )
}

// POST /api/questions/ai-explanation
// Same logic as /api/questions/[id]/ai-explanation but used when creating a
// new question (no question ID / ownership check needed).
export const POST = withTeacher(async (req, { user, profile, db }) => {
  const cap = requirePermission({ profile }, 'questions:create')
  if (!cap.ok) return NextResponse.json({ data: null, error: cap.error }, { status: cap.status })

  const body = await req.json()
  const parsed = GenerateExplanationSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 })

  const correctAnswer = getCorrectAnswer(parsed.data)
  if (!correctAnswer) {
    return NextResponse.json({ data: null, error: 'A correct answer is required.' }, { status: 400 })
  }

  // Fetch up to 3 of this teacher's existing questions with explanations as examples.
  const { data: examplesRaw } = await db
    .from('questions')
    .select(
      'content, teacher_explanation, question_options(content, is_correct), question_accepted_answers(answer_text)'
    )
    .eq('created_by', user.id)
    .not('teacher_explanation', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(3)

  const teacherExamples: TeacherExample[] = ((examplesRaw ?? []) as unknown as ExampleRow[])
    .map((example) => ({
      questionContent: example.content,
      correctAnswer: getExampleCorrectAnswer(example),
      teacherExplanation: example.teacher_explanation ?? '',
    }))
    .filter((example) => example.correctAnswer && example.teacherExplanation)

  const result = await generateExplanationResult({
    questionContent: parsed.data.content,
    correctAnswer,
    options: parsed.data.options?.map((option) => ({
      label: option.label,
      content: option.content,
      isCorrect: option.is_correct,
    })),
    teacherExamples,
  })

  if (!result.ok) {
    return NextResponse.json({ data: null, error: result.error }, { status: 502 })
  }

  return NextResponse.json({ data: { explanation: result.explanation }, error: null })
})

const requirePermission = jest.fn()
const assertTeacherOwnsQuestion = jest.fn()

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}))

jest.mock('@/lib/with-auth', () => ({
  withTeacher: (handler: unknown) => handler,
}))

jest.mock('@/lib/authz', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  assertTeacherOwnsQuestion: (...args: unknown[]) => assertTeacherOwnsQuestion(...args),
}))

import { GET } from '@/app/api/questions/[id]/edit-data/route'

function queryResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.order = () => builder
  builder.single = () => Promise.resolve(result)
  builder.then = (
    resolve: (value: typeof result) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject)
  return builder
}

function database(results: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: jest.fn((table: string) => queryResult(results[table])),
  }
}

const profile = {
  id: 'teacher-1',
  role: 'teacher',
  is_active: true,
  permissions: ['questions:update'],
  class_ids: [],
}

describe('GET /api/questions/[id]/edit-data', () => {
  beforeEach(() => {
    requirePermission.mockReset()
    assertTeacherOwnsQuestion.mockReset()
    requirePermission.mockReturnValue({ ok: true })
    assertTeacherOwnsQuestion.mockResolvedValue({ ok: true })
  })

  it('returns all editor data in one response and preserves the stored correct option', async () => {
    const db = database({
      questions: {
        data: { id: 'question-1', type: 'multiple_choice', content: 'Question' },
        error: null,
      },
      question_options: {
        data: [
          { id: 'option-a', label: 'A', content: 'A', is_correct: false, order: 1 },
          { id: 'option-d', label: 'D', content: 'D', is_correct: true, order: 4 },
        ],
        error: null,
      },
      question_accepted_answers: { data: [], error: null },
      tags: { data: [{ id: 'tag-1', subject: 'math', name: 'Algebra' }], error: null },
      question_tags: { data: [{ tag_id: 'tag-1' }], error: null },
    })

    const response = await GET({} as never, {
      user: { id: 'teacher-1' },
      profile,
      db,
      params: { id: 'question-1' },
    } as never) as unknown as { status: number; body: { data: { options: Array<{ label: string; is_correct: boolean }> } } }

    expect(response.status).toBe(200)
    expect(response.body.data.options).toEqual([
      expect.objectContaining({ label: 'A', is_correct: false }),
      expect.objectContaining({ label: 'D', is_correct: true }),
    ])
    expect(db.from).toHaveBeenCalledTimes(5)
  })

  it('does not read editor data when ownership verification fails', async () => {
    assertTeacherOwnsQuestion.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const db = database({})

    const response = await GET({} as never, {
      user: { id: 'teacher-1' },
      profile,
      db,
      params: { id: 'question-1' },
    } as never) as unknown as { status: number; body: { error: string } }

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Forbidden')
    expect(db.from).not.toHaveBeenCalled()
  })
})

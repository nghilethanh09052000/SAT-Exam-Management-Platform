const requirePermission = jest.fn()

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}))

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

jest.mock('@/lib/with-auth', () => ({
  withTeacher: (handler: unknown) => handler,
}))

jest.mock('@/lib/authz', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  assertTeacherOwnsQuestion: jest.fn(),
}))

import { GET } from '@/app/api/questions/[id]/route'

function questionQuery(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.single = jest.fn(() => Promise.resolve(result))
  return builder
}

describe('GET /api/questions/[id]', () => {
  beforeEach(() => {
    requirePermission.mockReset()
    requirePermission.mockReturnValue({ ok: true })
  })

  it('uses the already-authorized server database client for the detail read', async () => {
    const detail = {
      id: 'question-1',
      content: 'Question',
      question_options: [{ id: 'option-d', label: 'D', is_correct: true, order: 4 }],
      question_accepted_answers: [],
    }
    const query = questionQuery({ data: detail, error: null })
    const db = { from: jest.fn(() => query) }

    const response = await GET({} as never, {
      profile: { permissions: ['questions:view'] },
      db,
      params: { id: 'question-1' },
    } as never) as unknown as { status: number; body: { data: typeof detail } }

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(detail)
    expect(db.from).toHaveBeenCalledWith('questions')
    expect(query.eq).toHaveBeenCalledWith('id', 'question-1')
  })

  it('does not query when the teacher lacks view permission', async () => {
    requirePermission.mockReturnValue({ ok: false, status: 403, error: 'Forbidden' })
    const db = { from: jest.fn() }

    const response = await GET({} as never, {
      profile: { permissions: [] },
      db,
      params: { id: 'question-1' },
    } as never) as unknown as { status: number; body: { error: string } }

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('Forbidden')
    expect(db.from).not.toHaveBeenCalled()
  })
})

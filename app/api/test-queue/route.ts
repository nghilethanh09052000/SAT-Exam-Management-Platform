import { NextResponse } from 'next/server'
import { QUEUE_TOPICS } from '@/lib/queues/names'
import { WorkerSmokeTestPayloadSchema } from '@/lib/queues/payloads'
import { sendQueueMessage } from '@/lib/queues/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!canUseSmokeTestRoute(request)) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 })
  }

  const body = await readBody(request)
  const payload = WorkerSmokeTestPayloadSchema.parse({
    job: 'worker-smoke-test',
    requestId: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    message: typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'Hello from the SAT platform queue smoke test.',
  })

  const result = await sendQueueMessage(QUEUE_TOPICS.smokeTest, payload, {
    idempotencyKey: `worker-smoke-test:${payload.requestId}`,
  })

  return NextResponse.json({
    data: {
      topic: QUEUE_TOPICS.smokeTest,
      messageId: result.messageId,
      payload,
    },
    error: null,
  })
}

function canUseSmokeTestRoute(request: Request) {
  if (process.env.NODE_ENV !== 'production') return true

  const secret = process.env.TEST_QUEUE_SECRET
  if (!secret) return false

  return request.headers.get('x-test-queue-secret') === secret
}

async function readBody(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

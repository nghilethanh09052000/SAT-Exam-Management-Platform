import type { MessageMetadata } from '@vercel/queue'
import { WorkerSmokeTestPayloadSchema, type WorkerSmokeTestPayload } from '@/lib/queues/payloads'

export async function runWorkerSmokeTestJob(
  payload: WorkerSmokeTestPayload,
  metadata?: Partial<MessageMetadata>
) {
  const parsed = WorkerSmokeTestPayloadSchema.parse(payload)
  const processedAt = new Date().toISOString()

  console.log('[worker-smoke-test] processed', {
    requestId: parsed.requestId,
    message: parsed.message,
    messageId: metadata?.messageId ?? null,
    deliveryCount: metadata?.deliveryCount ?? null,
    topicName: metadata?.topicName ?? null,
    processedAt,
  })

  return {
    requestId: parsed.requestId,
    processedAt,
  }
}


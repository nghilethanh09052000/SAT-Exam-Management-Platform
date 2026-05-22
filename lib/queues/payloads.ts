import { z } from 'zod'

export const WorkerSmokeTestPayloadSchema = z.object({
  job: z.literal('worker-smoke-test'),
  requestedAt: z.string().datetime(),
  requestId: z.string().uuid(),
  message: z.string().min(1).max(500),
})

export type WorkerSmokeTestPayload = z.infer<typeof WorkerSmokeTestPayloadSchema>


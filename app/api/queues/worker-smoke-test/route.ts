import { handleCallback } from '@vercel/queue'
import { runWorkerSmokeTestJob } from '@/lib/jobs/worker-smoke-test'
import { WorkerSmokeTestPayloadSchema } from '@/lib/queues/payloads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handleWorkerSmokeTest = handleCallback(async (message, metadata) => {
  const payload = WorkerSmokeTestPayloadSchema.parse(message)
  await runWorkerSmokeTestJob(payload, metadata)
})

export async function POST(request: Request) {
  return handleWorkerSmokeTest(request)
}

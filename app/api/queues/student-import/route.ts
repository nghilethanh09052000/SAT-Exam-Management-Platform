import { ImportStudentsPayloadSchema } from '@/lib/queues/payloads'
import { runStudentImportJob } from '@/lib/jobs/student-import'
import { handleQueueCallback } from '@/lib/queues/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handleStudentImport = handleQueueCallback(async (message) => {
  const payload = ImportStudentsPayloadSchema.parse(message)
  await runStudentImportJob({ studentImportId: payload.studentImportId })
})

export async function POST(request: Request) {
  return handleStudentImport(request)
}

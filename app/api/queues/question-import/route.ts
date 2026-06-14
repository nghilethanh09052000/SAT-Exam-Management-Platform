import {
  ParseQuestionImportPayloadSchema,
  QuestionImportPayloadSchema,
  SaveQuestionImportPayloadSchema,
} from '@/lib/queues/payloads'
import { runParseQuestionImportJob, runSaveQuestionImportJob } from '@/lib/jobs/question-import'
import { handleQueueCallback } from '@/lib/queues/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handleQuestionImport = handleQueueCallback(async (message) => {
  const payload = QuestionImportPayloadSchema.parse(message)

  if (payload.job === 'parse-question-import') {
    const parsed = ParseQuestionImportPayloadSchema.parse(payload)
    await runParseQuestionImportJob({
      importId: parsed.importId,
      skipDedup: parsed.skipDedup,
      parserMode: parsed.parserMode,
    })
    return
  }

  const parsed = SaveQuestionImportPayloadSchema.parse(payload)
  await runSaveQuestionImportJob({
    importId: parsed.importId,
    requestedBy: parsed.requestedBy,
  })
})

export async function POST(request: Request) {
  return handleQuestionImport(request)
}

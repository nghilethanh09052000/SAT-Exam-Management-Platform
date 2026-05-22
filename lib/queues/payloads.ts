import { z } from 'zod'

export const WorkerSmokeTestPayloadSchema = z.object({
  job: z.literal('worker-smoke-test'),
  requestedAt: z.string().datetime(),
  requestId: z.string().uuid(),
  message: z.string().min(1).max(500),
})

export type WorkerSmokeTestPayload = z.infer<typeof WorkerSmokeTestPayloadSchema>

export const ParseQuestionImportPayloadSchema = z.object({
  job: z.literal('parse-question-import'),
  importId: z.string().uuid(),
  uploadedBy: z.string().uuid(),
  skipDedup: z.boolean().default(false),
})

export type ParseQuestionImportPayload = z.infer<typeof ParseQuestionImportPayloadSchema>

export const SaveQuestionImportPayloadSchema = z.object({
  job: z.literal('save-question-import'),
  importId: z.string().uuid(),
  requestedBy: z.string().uuid(),
})

export type SaveQuestionImportPayload = z.infer<typeof SaveQuestionImportPayloadSchema>

export const ImportStudentsPayloadSchema = z.object({
  job: z.literal('import-students'),
  studentImportId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
})

export type ImportStudentsPayload = z.infer<typeof ImportStudentsPayloadSchema>

export const QuestionImportPayloadSchema = z.discriminatedUnion('job', [
  ParseQuestionImportPayloadSchema,
  SaveQuestionImportPayloadSchema,
])

export type QuestionImportPayload = z.infer<typeof QuestionImportPayloadSchema>

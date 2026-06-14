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
  uploadedBy: z.string().min(1),
  skipDedup: z.boolean().default(false),
  parserMode: z.enum(['default', 'deepseek']).default('default'),
})

export type ParseQuestionImportPayload = z.infer<typeof ParseQuestionImportPayloadSchema>

export const SaveQuestionImportPayloadSchema = z.object({
  job: z.literal('save-question-import'),
  importId: z.string().uuid(),
  requestedBy: z.string().min(1),
})

export type SaveQuestionImportPayload = z.infer<typeof SaveQuestionImportPayloadSchema>

export const ImportStudentsPayloadSchema = z.object({
  job: z.literal('import-students'),
  studentImportId: z.string().uuid(),
  requestedBy: z.string().min(1),
  classId: z.string().uuid().nullable().optional(),
})

export type ImportStudentsPayload = z.infer<typeof ImportStudentsPayloadSchema>

export const QuestionImportPayloadSchema = z.discriminatedUnion('job', [
  ParseQuestionImportPayloadSchema,
  SaveQuestionImportPayloadSchema,
])

export type QuestionImportPayload = z.infer<typeof QuestionImportPayloadSchema>

// ─── Grade Submission ─────────────────────────────────────────────────────────

export const GradeSubmissionAnswerSchema = z.object({
  question_id:          z.string().uuid(),
  selected_option_id:   z.string().uuid().nullable().optional(),
  answer_text:          z.string().nullable().optional(),
  time_spent_seconds:   z.number().int().nullable().optional(),
  is_marked_for_review: z.boolean().optional(),
})

export const GradeSubmissionPayloadSchema = z.object({
  job:                z.literal('grade-submission'),
  submissionId:       z.string().uuid(),
  studentId:          z.string().uuid(),
  answers:            z.array(GradeSubmissionAnswerSchema),
  time_spent_seconds: z.number().int().optional(),
})

export type GradeSubmissionPayload = z.infer<typeof GradeSubmissionPayloadSchema>

import { z } from 'zod'

export const StudentRowSchema = z.object({
  full_name: z.string().min(1, 'Họ tên không được để trống'),
  email: z.string().email('Email không hợp lệ'),
  phone: z.string().nullable().optional(),
  birth_year: z
    .number({ error: 'Năm sinh phải là số' })
    .int('Năm sinh phải là số nguyên')
    .min(1990, 'Năm sinh phải từ 1990 đến 2020')
    .max(2020, 'Năm sinh phải từ 1990 đến 2020')
    .nullable()
    .optional(),
  gender: z.string().nullable().optional(),
  school: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  facebook_url: z.string().nullable().optional(),
  threads_url: z.string().nullable().optional(),
  hobbies: z.string().nullable().optional(),
  target_score: z
    .number({ error: 'Điểm mục tiêu SAT phải là số' })
    .int('Điểm mục tiêu SAT phải là số nguyên')
    .min(400, 'Điểm mục tiêu SAT phải từ 400 đến 1600')
    .max(1600, 'Điểm mục tiêu SAT phải từ 400 đến 1600')
    .nullable()
    .optional(),
  source: z.string().nullable().optional(),
})

export type StudentImportValidationError = {
  type: 'validation'
  row: number | null
  field: string
  path: Array<string | number>
  code: string
  message: string
  error: string
}

export type StudentImportRuntimeError = {
  type: 'auth' | 'profile' | 'enrollment' | 'unknown'
  email: string
  message: string
  error: string
}

export type StudentImportError = StudentImportValidationError | StudentImportRuntimeError

export function formatStudentImportValidationError(
  error: z.ZodError
): { summary: string; errors: StudentImportValidationError[] } {
  const errors = error.issues.map((issue) => {
    const path = issue.path.map((segment) =>
      typeof segment === 'symbol' ? segment.toString() : segment
    )
    const studentIndex = issue.path[0] === 'students' && typeof issue.path[1] === 'number'
      ? issue.path[1] + 1
      : null
    const field = typeof issue.path[2] === 'string'
      ? issue.path[2]
      : issue.path.map(String).join('.') || 'request'

    return {
      type: 'validation' as const,
      row: studentIndex,
      field,
      path,
      code: issue.code,
      message: issue.message,
      error: studentIndex ? `Dòng ${studentIndex}, ${field}: ${issue.message}` : issue.message,
    }
  })

  return {
    summary: errors[0]?.error ?? 'Dữ liệu không hợp lệ',
    errors,
  }
}

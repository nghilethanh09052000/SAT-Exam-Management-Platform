import { randomUUID } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FileImportStatus, SourceFileType } from '@/types/database'

export const QUESTION_IMPORTS_BUCKET = 'question-imports'
export const QUESTION_IMAGES_BUCKET = 'question-images'

type RawClient = SupabaseClient

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function sanitizeFilename(filename: string) {
  const normalized = filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'upload'
}

export function getSourceFileType(file: File): SourceFileType | null {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  return null
}

export function getAllowedMimeType(file: File, fileType: SourceFileType) {
  if (file.type) return file.type
  return fileType === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf'
}

export function buildImportStoragePath(userId: string, importId: string, filename: string) {
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `question-imports/${userId}/${year}/${month}/${importId}-${sanitizeFilename(filename)}`
}

export async function createFileImportFromUpload({
  raw,
  userId,
  file,
  sourceContext,
}: {
  raw: RawClient
  userId: string
  file: File
  sourceContext: string
}) {
  const fileType = getSourceFileType(file)
  if (!fileType) {
    throw new Error('Chỉ chấp nhận file .docx hoặc .pdf.')
  }

  const importId = randomUUID()
  const storagePath = buildImportStoragePath(userId, importId, file.name)
  const mimeType = getAllowedMimeType(file, fileType)
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await raw.storage
    .from(QUESTION_IMPORTS_BUCKET)
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Không thể lưu file lên Supabase Storage: ${uploadError.message}`)
  }

  const { data, error } = await raw
    .from('file_imports')
    .insert({
      id: importId,
      uploaded_by: userId,
      original_filename: file.name,
      storage_bucket: QUESTION_IMPORTS_BUCKET,
      storage_path: storagePath,
      file_type: fileType,
      mime_type: mimeType,
      file_size_bytes: file.size,
      import_type: 'questions',
      source_context: sourceContext,
      status: 'processing',
    })
    .select('id, storage_bucket, storage_path, file_type')
    .single()

  if (error || !data) {
    await deleteImportStorageObject(raw, QUESTION_IMPORTS_BUCKET, storagePath)
    throw new Error(`Không thể lưu thông tin file tải lên: ${error?.message ?? 'Lỗi không xác định'}`)
  }

  return { importId, arrayBuffer, fileType, storagePath }
}

export async function deleteImportStorageObject(
  raw: RawClient,
  bucket: string,
  storagePath: string
) {
  const { error } = await raw.storage.from(bucket).remove([storagePath])
  if (error) {
    console.error(`[file-import] Failed to delete ${bucket}/${storagePath}: ${error.message}`)
  }
}

/**
 * Upload a question image (base64 data URL) to the `question-images` Storage
 * bucket and return its permanent public URL.
 *
 * Path: {importId}/{contentHash}.{ext}
 * Using contentHash in the path makes uploads idempotent — re-importing the
 * same question replaces the same object rather than creating duplicates.
 *
 * @returns Public URL string, or null if the base64DataUrl is empty/invalid.
 */
export async function uploadQuestionImage(
  raw: RawClient,
  {
    importId,
    contentHash,
    base64DataUrl,
  }: {
    importId: string
    contentHash: string
    base64DataUrl: string
  }
): Promise<string | null> {
  // Parse "data:<contentType>;base64,<data>"
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(base64DataUrl)
  if (!match) return null

  const contentType = match[1]             // e.g. "image/png"
  const base64Data  = match[2]
  const ext         = contentType.split('/')[1].replace(/\+.*$/, '') // png | jpeg | gif | webp
  const storagePath = `${importId}/${contentHash}.${ext}`
  const buffer      = Buffer.from(base64Data, 'base64')

  const { error } = await raw.storage
    .from(QUESTION_IMAGES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true, // idempotent: same hash = same file
    })

  if (error) {
    throw new Error(`Không thể lưu ảnh câu hỏi lên Storage: ${error.message}`)
  }

  const { data } = raw.storage
    .from(QUESTION_IMAGES_BUCKET)
    .getPublicUrl(storagePath)

  return data.publicUrl
}

/**
 * Upload the LaTeX/structured-text representation of an imported file.
 * Stored at: question-imports/latex/{importId}.txt
 * Returns the storage path so it can be written to file_imports.latex_storage_path.
 */
export async function uploadLatexContent(
  raw: RawClient,
  { importId, content }: { importId: string; content: string }
): Promise<string> {
  const storagePath = `question-imports/latex/${importId}.txt`
  const buffer = Buffer.from(content, 'utf-8')

  const { error } = await raw.storage
    .from(QUESTION_IMPORTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'text/plain; charset=utf-8',
      upsert: false,
    })

  if (error) {
    throw new Error(`Không thể lưu file LaTeX: ${error.message}`)
  }

  return storagePath
}

export async function updateFileImportStatus({
  raw,
  importId,
  status,
  totalRecords,
  successCount,
  failureCount,
  errorMessage,
}: {
  raw: RawClient
  importId: string
  status: FileImportStatus
  totalRecords?: number
  successCount?: number
  failureCount?: number
  errorMessage?: string | null
}) {
  await raw
    .from('file_imports')
    .update({
      status,
      ...(totalRecords !== undefined ? { total_records: totalRecords } : {}),
      ...(successCount !== undefined ? { success_count: successCount } : {}),
      ...(failureCount !== undefined ? { failure_count: failureCount } : {}),
      ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', importId)
}

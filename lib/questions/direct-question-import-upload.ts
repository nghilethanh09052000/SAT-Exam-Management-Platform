'use client'

import { createBrowserClient } from '@/lib/supabase/browser'

type DirectUploadResponse = {
  upload_import_id: string
  bucket: string
  storage_path: string
  token: string
  path: string
  mime_type: string
}

export async function uploadQuestionImportFile(
  file: File,
  {
    sourceContext,
    skipDedup,
  }: {
    sourceContext?: string
    skipDedup?: boolean
  } = {}
) {
  const createRes = await fetch('/api/questions/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create-upload',
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || undefined,
      sourceContext,
    }),
  })
  const createJson = await createRes.json()

  if (!createRes.ok || createJson.error) {
    throw new Error(createJson.error ?? 'Không thể chuẩn bị upload file.')
  }

  const upload = createJson.data as DirectUploadResponse
  const supabase = createBrowserClient()
  const { error: uploadError } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: upload.mime_type,
    })

  if (uploadError) {
    throw new Error(`Không thể upload file lên Storage: ${uploadError.message}`)
  }

  const enqueueRes = await fetch('/api/questions/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'enqueue',
      importId: upload.upload_import_id,
      skipDedup,
    }),
  })
  const enqueueJson = await enqueueRes.json()

  if (!enqueueRes.ok || enqueueJson.error) {
    throw new Error(enqueueJson.error ?? 'Không thể đưa file vào hàng đợi xử lý.')
  }

  return enqueueJson.data as {
    upload_import_id: string
    storage_path: string
    status: string
    message_id: string
  }
}

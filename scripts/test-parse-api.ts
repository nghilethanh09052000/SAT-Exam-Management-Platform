/**
 * Test script: upload a .docx/.pdf and run the full parse job directly.
 * Bypasses HTTP auth + Vercel Queue by calling the job function inline,
 * but exercises the same storage + parsing + DB logic as production.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-parse-api.ts <path-to-file>
 *
 * Example:
 *   npx tsx --env-file=.env.local scripts/test-parse-api.ts \
 *     ~/Downloads/"ĐỀ MINH HỌA (Template Format).docx"
 */

import { readFileSync } from 'fs'
import { resolve, basename } from 'path'
import { randomUUID } from 'crypto'
import {
  createServiceClient,
  QUESTION_IMPORTS_BUCKET,
  deleteImportStorageObject,
} from '../lib/import-files'
import { runParseQuestionImportJob } from '../lib/jobs/question-import'

// ── resolve file path ─────────────────────────────────────────────────────────

const rawPath = process.argv[2]
if (!rawPath) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/test-parse-api.ts <path-to-file>')
  process.exit(1)
}
const filePath = resolve(rawPath)
const fileName = basename(filePath)
const fileExt  = fileName.split('.').pop()?.toLowerCase() as 'docx' | 'pdf'

if (fileExt !== 'docx' && fileExt !== 'pdf') {
  console.error('Only .docx and .pdf files are supported.')
  process.exit(1)
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildStoragePath(userId: string, importId: string, filename: string) {
  const now   = new Date()
  const year  = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const safe  = filename
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 120) || 'upload'
  return `question-imports/${userId}/${year}/${month}/${importId}-${safe}`
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const raw = createServiceClient() as any

  // 1. Find a teacher/admin to act as uploader
  const { data: profile, error: profileError } = await (raw.from('profiles') as any)
    .select('id, full_name, role')
    .in('role', ['teacher', 'admin'])
    .limit(1)
    .single()

  if (profileError || !profile) {
    console.error('No teacher/admin profile found:', profileError?.message)
    process.exit(1)
  }
  console.log(`\nUploader: ${profile.full_name} (${profile.role})`)
  console.log(`File:     ${fileName} (${(readFileSync(filePath).length / 1024).toFixed(1)} KB)`)

  // 2. Upload file to storage
  const fileBytes   = readFileSync(filePath)
  const mimeType    = fileExt === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf'
  const importId    = randomUUID()
  const storagePath = buildStoragePath(profile.id, importId, fileName)

  console.log(`\n[1/3] Uploading to storage...`)
  const { error: uploadError } = await raw.storage
    .from(QUESTION_IMPORTS_BUCKET)
    .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false })

  if (uploadError) {
    console.error('Storage upload failed:', uploadError.message)
    process.exit(1)
  }
  console.log(`      OK — ${storagePath}`)

  // 3. Insert file_imports row
  const { error: insertError } = await (raw.from('file_imports') as any).insert({
    id:                importId,
    uploaded_by:       profile.id,
    original_filename: fileName,
    storage_bucket:    QUESTION_IMPORTS_BUCKET,
    storage_path:      storagePath,
    file_type:         fileExt,
    mime_type:         mimeType,
    file_size_bytes:   fileBytes.length,
    import_type:       'questions',
    source_context:    'test-script',
    status:            'processing',
  })

  if (insertError) {
    await deleteImportStorageObject(raw, QUESTION_IMPORTS_BUCKET, storagePath)
    console.error('DB insert failed:', insertError.message)
    process.exit(1)
  }
  console.log(`      import_id: ${importId}`)

  // 4. Run parse job directly
  console.log(`\n[2/3] Running parse job...`)
  const t0 = Date.now()

  let result
  try {
    result = await runParseQuestionImportJob({ importId, skipDedup: false })
  } catch (err) {
    console.error('\nParse job threw:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`      Done in ${elapsed}s — status: ${result.status}`)

  // 5. Print results
  console.log(`\n[3/3] Results`)

  if (result.status === 'failed') {
    console.log(`  FAILED`)
    if (result.errors?.length) {
      for (const e of result.errors.slice(0, 5)) {
        console.log(`  •`, e)
      }
    }
    process.exit(1)
  }

  console.log(`  Total questions: ${result.total}`)

  // Fetch parsed payload from DB for details
  const { data: resultRow } = await (raw.from('file_import_results') as any)
    .select('parsed_payload')
    .eq('import_id', importId)
    .maybeSingle()

  const payload = resultRow?.parsed_payload as {
    total: number
    duplicates: number
    save_disabled_reason?: string
    questions: Array<{
      content: string
      type: string
      content_hash: string
      is_duplicate: boolean
      category: string | null
      image_url: string | null
      module: string
    }>
  } | null

  if (payload) {
    console.log(`  Duplicates:      ${payload.duplicates}`)
    if (payload.save_disabled_reason) {
      console.log(`  ⚠ Save disabled: ${payload.save_disabled_reason}`)
    }

    console.log(`\nFirst 5 questions:`)
    for (const q of (payload.questions ?? []).slice(0, 5)) {
      const preview = q.content.replace(/\n/g, ' ').slice(0, 80)
      console.log(`\n  [${q.type}] ${preview}...`)
      console.log(`    hash=${q.content_hash.slice(0, 12)}  duplicate=${q.is_duplicate}  category=${q.category ?? '-'}  module=${q.module}`)
      if (q.image_url) console.log(`    image=${q.image_url}`)
    }
  }

  console.log(`\nSupabase Studio: http://127.0.0.1:54323`)
  console.log(`  file_imports row: id = ${importId}`)
}

main()

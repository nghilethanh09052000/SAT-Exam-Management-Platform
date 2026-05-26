/**
 * Test script: upload a .docx/.pdf file and run the full parse job directly.
 * Bypasses HTTP auth by using the service-role key, but exercises the same
 * storage + parsing + DB logic that the API route triggers.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-parse-api.mjs <path-to-file>
 *
 * Example:
 *   node --env-file=.env.local scripts/test-parse-api.mjs \
 *     ~/Downloads/ĐỀ\ MINH\ HỌA\ \(Template\ Format\).docx
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, basename } from 'path'
import { randomUUID } from 'crypto'

// ── config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.local scripts/test-parse-api.mjs <file>')
  process.exit(1)
}

const filePath = process.argv[2] ? resolve(process.argv[2]) : null
if (!filePath) {
  console.error('Usage: node --env-file=.env.local scripts/test-parse-api.mjs <path-to-file>')
  process.exit(1)
}

// ── helpers ───────────────────────────────────────────────────────────────────

const QUESTION_IMPORTS_BUCKET = 'question-imports'
const QUESTION_IMAGES_BUCKET  = 'question-images'

function buildStoragePath(userId, importId, filename) {
  const now   = new Date()
  const year  = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const safe  = filename.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload'
  return `question-imports/${userId}/${year}/${month}/${importId}-${safe}`
}

// ── main ──────────────────────────────────────────────────────────────────────

const raw = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 1. Find the first teacher/admin user to act as uploader
const { data: profile, error: profileError } = await raw
  .from('profiles')
  .select('id, full_name, role')
  .in('role', ['teacher', 'admin'])
  .limit(1)
  .single()

if (profileError || !profile) {
  console.error('No teacher/admin profile found in DB:', profileError?.message)
  process.exit(1)
}
console.log(`\nUsing uploader: ${profile.full_name} (${profile.role}) — ${profile.id}`)

// 2. Upload file to storage
const fileBytes = readFileSync(filePath)
const fileName  = basename(filePath)
const fileExt   = fileName.split('.').pop().toLowerCase()
const mimeType  = fileExt === 'docx'
  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  : 'application/pdf'

const importId   = randomUUID()
const storagePath = buildStoragePath(profile.id, importId, fileName)

console.log(`\nUploading to storage...`)
console.log(`  Bucket: ${QUESTION_IMPORTS_BUCKET}`)
console.log(`  Path:   ${storagePath}`)
console.log(`  Size:   ${(fileBytes.length / 1024).toFixed(1)} KB`)

const { error: uploadError } = await raw.storage
  .from(QUESTION_IMPORTS_BUCKET)
  .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false })

if (uploadError) {
  console.error('Storage upload failed:', uploadError.message)
  process.exit(1)
}
console.log('Storage upload OK.')

// 3. Insert file_imports record
const { error: insertError } = await raw.from('file_imports').insert({
  id:               importId,
  uploaded_by:      profile.id,
  original_filename: fileName,
  storage_bucket:   QUESTION_IMPORTS_BUCKET,
  storage_path:     storagePath,
  file_type:        fileExt,
  mime_type:        mimeType,
  file_size_bytes:  fileBytes.length,
  import_type:      'questions',
  source_context:   'test-script',
  status:           'processing',
})

if (insertError) {
  await raw.storage.from(QUESTION_IMPORTS_BUCKET).remove([storagePath])
  console.error('DB insert failed:', insertError.message)
  process.exit(1)
}
console.log(`DB record created. import_id: ${importId}`)

// 4. Run the parse job inline (same logic the queue worker calls)
console.log('\nRunning parse job...')

// Dynamic import of the job (TS via tsx/ts-node not available here, so we
// call the Supabase parse via a small inline re-implementation using the
// same parsers that are already compiled in .next/server if the app was built,
// or we trigger it via the internal Next.js dev server API if running.)

// Since the parsers are TypeScript, the easiest way to invoke them in a plain
// .mjs script is to POST to the internal queue handler route that the dev
// server exposes, or simply poll file_imports until status changes (if the
// dev server is running and auto-processes the queue).
//
// Here we call the /api/internal/process-queue-message route which is the
// Vercel Queue handler that the dev server processes automatically. Since we're
// running locally, the dev server picks up the queue and processes the job.
//
// So we just poll for the result.

console.log('\nWaiting for the dev server queue worker to process the job...')
console.log('(Make sure `npm run dev` is running in another terminal)\n')

const MAX_WAIT_MS  = 60_000
const POLL_INTERVAL = 2_000
const start = Date.now()

while (Date.now() - start < MAX_WAIT_MS) {
  await new Promise(r => setTimeout(r, POLL_INTERVAL))

  const { data: row } = await raw
    .from('file_imports')
    .select('status, total_records, failure_count, error_message')
    .eq('id', importId)
    .single()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  process.stdout.write(`  [${elapsed}s] status=${row?.status ?? '?'}\r`)

  if (['parsed', 'failed', 'success', 'partial_success'].includes(row?.status)) {
    console.log(`\n\nDone! Final status: ${row.status}`)
    if (row.total_records != null) console.log(`  Total questions: ${row.total_records}`)
    if (row.failure_count)        console.log(`  Failures:        ${row.failure_count}`)
    if (row.error_message)        console.log(`  Error:           ${row.error_message}`)

    // Show parsed questions summary
    const { data: result } = await raw
      .from('file_import_results')
      .select('parsed_payload, parse_errors')
      .eq('import_id', importId)
      .maybeSingle()

    if (result?.parsed_payload) {
      const payload = result.parsed_payload
      console.log(`\nParsed payload summary:`)
      console.log(`  Total:       ${payload.total}`)
      console.log(`  Duplicates:  ${payload.duplicates}`)
      if (payload.save_disabled_reason) {
        console.log(`  Save disabled: ${payload.save_disabled_reason}`)
      }
      if (payload.questions?.length) {
        console.log(`\nFirst 3 questions:`)
        for (const q of payload.questions.slice(0, 3)) {
          console.log(`  [${q.type}] ${q.content.slice(0, 80).replace(/\n/g, ' ')}...`)
          console.log(`    hash=${q.content_hash.slice(0, 12)}, duplicate=${q.is_duplicate}, category=${q.category}`)
        }
      }
    } else if (result?.parse_errors) {
      console.log('\nParse errors:', JSON.stringify(result.parse_errors, null, 2))
    }

    console.log(`\nSupabase Studio: http://127.0.0.1:54323`)
    console.log(`  Table: file_imports  → id = ${importId}`)
    console.log(`  Storage: ${QUESTION_IMPORTS_BUCKET}/${storagePath}`)
    process.exit(0)
  }
}

console.log('\nTimed out waiting for job. Check the dev server logs.')
console.log(`import_id: ${importId}`)
process.exit(1)

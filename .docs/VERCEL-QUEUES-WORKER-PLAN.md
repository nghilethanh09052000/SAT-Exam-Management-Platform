# Vercel Queues Worker Plan

## Goal

Add background processing for the SAT Exam Management Platform while keeping production cost within the current constraint:

```txt
Vercel Free + Supabase Pro ($25) + no extra paid services
```

Because the app is deployed on Vercel and there is no budget for a separate worker server, use **Vercel Queues** plus **Supabase status tables** instead of Graphile Worker.

## Decision

Use **Vercel Queues** for background job dispatch and Vercel Functions as queue consumers.

Use **Supabase/Postgres tables** for user-facing job status, progress, and results.

Why this fits the project:

- No Redis service.
- No separate always-running worker host.
- Works naturally with Vercel serverless deployment.
- Keeps app-side job status in Supabase where the UI can query it.
- Good fit for imports, parsing, email, AI generation, and scheduled or delayed work.

Avoid for now:

- **Graphile Worker**: good Postgres-backed worker, but it needs a continuously running Node process outside Vercel.
- **BullMQ**: good queue, but requires Redis.
- **Temporal TypeScript**: too heavy for current app-side jobs and also needs worker runtime.

## Architecture

```txt
Next.js API route on Vercel
  -> validates auth and permissions
  -> creates status row in Supabase
  -> uploads file/payload if needed
  -> publishes message to Vercel Queue
  -> returns status id immediately

Vercel Queue consumer function
  -> receives queue message
  -> performs background work
  -> updates Supabase status/result tables

Frontend
  -> polls status endpoint
  -> renders processing, success, partial success, or failed state
```

Important principle:

Vercel Queue should carry a **small message** with IDs and metadata, not large parsed payloads.

Large data should live in:

- Supabase Storage
- Supabase/Postgres tables
- JSONB result tables when appropriate

## First Jobs

### 1. `parse-question-import`

Current code:

```txt
app/api/questions/parse/route.ts
```

Current behavior:

- Uploads `.docx` or `.pdf`.
- Parses file during the HTTP request.
- Checks duplicate question hashes.
- Returns parsed questions immediately.

New behavior:

- API validates teacher/admin permission.
- API uploads original file to Supabase Storage.
- API creates a `file_imports` row with `status = 'processing'`.
- API publishes queue message:

```json
{
  "job": "parse-question-import",
  "importId": "...",
  "uploadedBy": "...",
  "skipDedup": false
}
```

- Consumer downloads the file from Supabase Storage.
- Consumer runs `parseDocx` or `parsePdf`.
- Consumer stores parsed output in `file_import_results`.
- Consumer updates `file_imports.status` to `parsed` or `failed`.

### 2. `save-question-import`

Current code:

```txt
app/api/questions/bulk-save/route.ts
```

Current behavior:

- Receives teacher-reviewed questions.
- Inserts questions/options/accepted answers/tags inside the HTTP request.

New behavior:

- API validates teacher/admin permission.
- API stores reviewed payload in `file_import_results.reviewed_payload`.
- API updates `file_imports.status = 'processing'`.
- API publishes queue message:

```json
{
  "job": "save-question-import",
  "importId": "...",
  "requestedBy": "..."
}
```

- Consumer inserts questions in batches.
- Consumer records row-level errors.
- Consumer updates `file_imports.status` to `success`, `partial_success`, or `failed`.

### 3. `import-students`

Current code:

```txt
app/api/students/import/route.ts
```

Current behavior:

- Validates class ownership.
- Creates Supabase Auth users.
- Updates profiles.
- Enrolls students into class.
- Processes up to 500 students in one request.

New behavior:

- API validates admin/teacher permission and class ownership.
- API creates `student_imports` row.
- API stores submitted student rows in `student_imports.payload`.
- API publishes queue message:

```json
{
  "job": "import-students",
  "studentImportId": "...",
  "requestedBy": "...",
  "classId": "..."
}
```

- Consumer creates users, updates profiles, enrolls students.
- Consumer records per-row errors.
- Consumer updates `student_imports.status` and counts.

## Future Jobs

Add after the first three are stable:

- `send-email`
- `generate-question-explanation`
- `suggest-question-tags`
- `cleanup-stale-submissions`
- `weekly-student-report`
- `rebuild-student-progress-summary`

## Proposed Folder Structure

```txt
lib/
  queues/
    client.ts                 # queue publish helper
    names.ts                  # queue/job constants
    payloads.ts               # Zod schemas and payload types

  jobs/
    question-import.ts         # shared question import logic
    student-import.ts          # shared student import logic

app/
  api/
    queues/
      question-import/
        route.ts              # Vercel Queue consumer endpoint/function
      student-import/
        route.ts              # Vercel Queue consumer endpoint/function

    question-imports/
      [id]/
        route.ts              # status endpoint

    student-imports/
      [id]/
        route.ts              # status endpoint
```

Exact Vercel Queue consumer structure may change based on the final Vercel Queues SDK/API shape used in this project. Keep the worker task logic in `lib/jobs/*` so the transport layer stays thin.

## Package / Setup

Add the Vercel Queues SDK/package recommended by Vercel for the current project setup.

Expected app-level helpers:

```ts
// lib/queues/names.ts
export const QUEUES = {
  questionImport: 'question-import',
  studentImport: 'student-import',
} as const
```

```ts
// lib/queues/payloads.ts
import { z } from 'zod'

export const ParseQuestionImportPayloadSchema = z.object({
  job: z.literal('parse-question-import'),
  importId: z.string().uuid(),
  uploadedBy: z.string().uuid(),
  skipDedup: z.boolean().default(false),
})

export const SaveQuestionImportPayloadSchema = z.object({
  job: z.literal('save-question-import'),
  importId: z.string().uuid(),
  requestedBy: z.string().uuid(),
})

export const ImportStudentsPayloadSchema = z.object({
  job: z.literal('import-students'),
  studentImportId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  classId: z.string().uuid(),
})
```

## Supabase Tables

### Existing Table: `file_imports`

Already exists and should remain the primary status table for question imports.

Useful existing columns:

- `id`
- `uploaded_by`
- `storage_bucket`
- `storage_path`
- `file_type`
- `total_records`
- `success_count`
- `failure_count`
- `status`
- `error_message`
- `created_at`
- `updated_at`

### New Table: `file_import_results`

Add this table to keep large JSON payloads out of `file_imports`.

```sql
CREATE TABLE public.file_import_results (
  import_id UUID PRIMARY KEY REFERENCES public.file_imports(id) ON DELETE CASCADE,
  parsed_payload JSONB,
  reviewed_payload JSONB,
  parse_errors JSONB,
  save_errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.file_import_results ENABLE ROW LEVEL SECURITY;
```

Recommended RLS:

- Teacher/admin can select own import results.
- Admin can select all import results.
- Writes should be service-role only from API/consumer functions.

### New Table: `student_imports`

```sql
CREATE TABLE public.student_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'success', 'partial_success', 'failed')),
  total_records INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  payload JSONB,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_imports_requested_by ON public.student_imports(requested_by);
CREATE INDEX idx_student_imports_status ON public.student_imports(status);
CREATE INDEX idx_student_imports_created_at ON public.student_imports(created_at DESC);

ALTER TABLE public.student_imports ENABLE ROW LEVEL SECURITY;
```

Recommended RLS:

- Admin can select all rows.
- Teacher can select rows they requested.
- Service role handles inserts/updates from server code.

## API Changes

### `POST /api/questions/parse`

Return immediately after enqueue:

```json
{
  "data": {
    "upload_import_id": "...",
    "status": "processing"
  },
  "error": null
}
```

### `GET /api/question-imports/:id`

Return status and parsed result when ready:

```json
{
  "data": {
    "id": "...",
    "status": "parsed",
    "total_records": 40,
    "success_count": 0,
    "failure_count": 0,
    "error_message": null,
    "parsed_payload": {
      "questions": []
    },
    "parse_errors": null
  },
  "error": null
}
```

### `POST /api/questions/bulk-save`

Return immediately after enqueue:

```json
{
  "data": {
    "upload_import_id": "...",
    "status": "processing"
  },
  "error": null
}
```

### `POST /api/students/import`

Return immediately after enqueue:

```json
{
  "data": {
    "student_import_id": "...",
    "status": "processing"
  },
  "error": null
}
```

### `GET /api/student-imports/:id`

Return student import status:

```json
{
  "data": {
    "id": "...",
    "status": "partial_success",
    "total_records": 100,
    "success_count": 96,
    "failure_count": 4,
    "result": {
      "created": 80,
      "enrolled": 96,
      "skipped": 16,
      "errors": []
    }
  },
  "error": null
}
```

## Frontend Changes

### Question Upload UI

Current flow:

```txt
Upload -> wait -> receive parsed questions -> review
```

New flow:

```txt
Upload -> receive import id -> show processing state -> poll status -> show review
```

Polling behavior:

- Poll every 2 seconds for the first 30 seconds.
- Then every 5 seconds.
- Stop polling on `parsed`, `success`, `partial_success`, or `failed`.

### Student Import UI

Current flow:

```txt
Submit CSV rows -> wait -> receive result
```

New flow:

```txt
Submit CSV rows -> receive import id -> show processing state -> poll status -> show final result
```

## Consumer Rules

Each queue consumer should:

- Validate payload with Zod.
- Use service-role Supabase client.
- Fetch authoritative data from DB by ID.
- Avoid trusting full payload contents from the queue message.
- Update status to `processing` when it starts.
- Update counts as work completes.
- Store row-level errors.
- Catch errors and mark job status as `failed`.
- Be idempotent where possible.

## Handling Time Limits

Vercel Functions are not always-on workers. Keep jobs bounded.

Rules:

- Keep each queue message small.
- Process large imports in chunks when needed.
- For student import, split into batches if 500 rows becomes too slow.
- For large parse/save jobs, use follow-up queue messages if the function approaches timeout.

Example chunking plan for student imports:

```txt
import-students-start
  -> creates batch messages

import-students-batch
  -> processes rows 1-50
  -> updates counts
  -> next batch continues

import-students-finish
  -> calculates final status
```

Start simple with one message per import, then chunk if real data shows timeout risk.

## Idempotency

Use idempotency to prevent duplicate processing:

- Queue message contains `importId` or `studentImportId`.
- Consumer checks current status before processing.
- If status is already terminal, return early.
- Use DB unique constraints where possible.
- Use upsert/ON CONFLICT for repeatable writes.

Terminal statuses:

- `parsed`
- `success`
- `partial_success`
- `failed`

## Security

- Queue consumers must not rely on browser cookies.
- Queue payload should include IDs, not secret data.
- Consumer functions should verify records from Supabase by ID.
- Supabase service role key must only exist in server/consumer runtime.
- Status endpoints must enforce ownership and role checks.
- Admin can see all imports; teachers can see only their own.

## Observability

Use Supabase tables as the main app-facing source of truth.

Add logs in each consumer:

- job name
- import id
- status transition
- count processed
- error message

Optional internal admin page later:

```txt
/admin/jobs
```

Show:

- recent question imports
- recent student imports
- status
- counts
- error messages
- links to original file/import result

## Implementation Phases

### Phase 1: Queue Foundation

- Add queue client helper.
- Add queue payload schemas.
- Add a test queue message and consumer.
- Confirm Vercel local/dev behavior if supported.
- Confirm production queue delivery on Vercel.

### Phase 2: Status Tables

- Add `file_import_results`.
- Add `student_imports`.
- Add RLS policies.
- Add status endpoints:
  - `GET /api/question-imports/:id`
  - `GET /api/student-imports/:id`

### Phase 3: Question Parse

- Move parse work from `POST /api/questions/parse` to queue consumer.
- Keep upload/auth in the API route.
- Store parsed output in `file_import_results`.
- Update upload UI to poll.

### Phase 4: Question Save

- Move save loop from `POST /api/questions/bulk-save` to queue consumer.
- Store reviewed payload before enqueue.
- Record save errors.
- Update review UI to show processing/final result.

### Phase 5: Student Import

- Move student account creation/enrollment to queue consumer.
- Store row-level result in `student_imports.result`.
- Update UI to poll status.

### Phase 6: Future Jobs

- Add email jobs.
- Add AI generation jobs.
- Add scheduled cleanup/report jobs.

## Local Development

For local development, support two modes:

### Mode A: Real Queue

Use Vercel's local/dev queue support if available and stable.

### Mode B: Direct Runner Fallback

Add a local-only helper that calls the same task function directly after enqueue.

```txt
API route
  -> creates status row
  -> in local dev, optionally runs task directly
  -> in production, publishes to Vercel Queue
```

Keep task logic in `lib/jobs/*` so both queue consumers and local fallback call the same code.

## Success Criteria

- Upload/parse API responds quickly.
- Student import API responds quickly.
- Browser can close while jobs continue.
- UI can show processing and final result from Supabase status tables.
- No Redis is required.
- No separate worker server is required.
- No additional paid service is required beyond Vercel Free and Supabase Pro.
- Existing Python Temporal SAT pipeline remains separate and unaffected.


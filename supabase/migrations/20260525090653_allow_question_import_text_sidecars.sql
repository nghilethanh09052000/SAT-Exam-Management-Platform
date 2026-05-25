-- Allow mapped-format sidecar text files to be stored next to imported DOCX/PDF files.
-- The parser writes question-imports/latex/{importId}.txt for audit/review.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]
WHERE id = 'question-imports';

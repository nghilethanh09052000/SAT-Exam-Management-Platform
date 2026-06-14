-- Allow vector graph previews generated from SAT Question Bank PDFs.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml'
]
WHERE id = 'question-images';

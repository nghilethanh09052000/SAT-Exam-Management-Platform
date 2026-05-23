-- Migration: 00035_question_images_bucket.sql
-- Create a public Supabase Storage bucket for question images.
-- Images are extracted from uploaded .docx / PDF files and stored here
-- so that questions.image_url holds a plain URL — never a base64 blob.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-images',
  'question-images',
  true,
  5242880, -- 5 MB per image
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can read question images (students, teachers, public test)
CREATE POLICY "question_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');

-- Only service role (background import job) can upload/replace images.
-- Authenticated users cannot write directly — all writes go through the
-- import worker which uses the service role key.
CREATE POLICY "question_images_service_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images');

CREATE POLICY "question_images_service_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'question-images');

CREATE POLICY "question_images_service_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'question-images');

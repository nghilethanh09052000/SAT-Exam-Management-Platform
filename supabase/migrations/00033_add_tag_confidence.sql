-- Migration: 00033_add_tag_confidence
-- Adds a confidence column to question_tags so the UI can flag
-- auto-classified questions for teacher review.
--
-- confidence values:
--   'high'   → rule-based, strong keyword match (≥ 3 hits)
--   'medium' → rule-based, weak keyword match (1–2 hits)
--   'low'    → rule-based, very weak match or regex fallback
--   'manual' → teacher explicitly set this tag

ALTER TABLE question_tags
  ADD COLUMN IF NOT EXISTS confidence TEXT
    CHECK (confidence IN ('high', 'medium', 'low', 'manual'))
    DEFAULT 'high';

COMMENT ON COLUMN question_tags.confidence IS
  'Classification confidence: high/medium/low = auto-classified, manual = teacher-set';

-- Back-fill existing rows (imported before this migration) as ''high' since
-- they were set by a teacher or from a DOCX skill: field.
UPDATE question_tags
SET confidence = 'high'
WHERE confidence IS NULL;

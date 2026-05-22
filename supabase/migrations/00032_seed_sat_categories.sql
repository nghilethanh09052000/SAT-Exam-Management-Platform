-- Migration: 00032_seed_sat_categories
-- Seeds the canonical 14 SAT skill categories into the tags table.
-- Safe to re-run: ON CONFLICT DO NOTHING skips existing rows.

INSERT INTO tags (id, subject, name) VALUES
  -- Reading & Writing
  (gen_random_uuid(), 'reading_writing', 'Words in Context'),
  (gen_random_uuid(), 'reading_writing', 'Central Ideas and Details'),
  (gen_random_uuid(), 'reading_writing', 'Command of Evidence – Textual'),
  (gen_random_uuid(), 'reading_writing', 'Command of Evidence – Quantitative'),
  (gen_random_uuid(), 'reading_writing', 'Inferences'),
  (gen_random_uuid(), 'reading_writing', 'Text Structure and Purpose'),
  (gen_random_uuid(), 'reading_writing', 'Cross-Text Connections'),
  (gen_random_uuid(), 'reading_writing', 'Rhetorical Synthesis'),
  (gen_random_uuid(), 'reading_writing', 'Transitions'),
  (gen_random_uuid(), 'reading_writing', 'Standard English Conventions'),
  -- Math
  (gen_random_uuid(), 'math', 'Algebra'),
  (gen_random_uuid(), 'math', 'Advanced Math'),
  (gen_random_uuid(), 'math', 'Problem-Solving and Data Analysis'),
  (gen_random_uuid(), 'math', 'Geometry and Trigonometry')
ON CONFLICT (subject, name) DO NOTHING;

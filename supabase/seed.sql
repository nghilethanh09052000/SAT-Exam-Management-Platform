-- seed.sql — Seed data for local development
-- Inserts all predefined tags for Reading & Writing and Math

-- ─── READING & WRITING TAGS ────────────────────────────────────────────────

INSERT INTO public.tags (subject, name) VALUES
  ('reading_writing', 'Words in Context'),
  ('reading_writing', 'Punctuation'),
  ('reading_writing', 'Subject-Verb Agreement'),
  ('reading_writing', 'Logical Transition'),
  ('reading_writing', 'Central Ideas'),
  ('reading_writing', 'Command of Evidence'),
  ('reading_writing', 'Cross-text Connections'),
  ('reading_writing', 'Rhetorical Synthesis'),
  ('reading_writing', 'Transitions'),
  ('reading_writing', 'Form Structure and Sense'),
  ('reading_writing', 'Boundaries')
ON CONFLICT (subject, name) DO NOTHING;

-- ─── MATH TAGS ─────────────────────────────────────────────────────────────

INSERT INTO public.tags (subject, name) VALUES
  ('math', 'Linear Equations'),
  ('math', 'Quadratic Functions'),
  ('math', 'Geometry Circles'),
  ('math', 'Data Analysis'),
  ('math', 'Systems of Equations'),
  ('math', 'Inequalities'),
  ('math', 'Percentages'),
  ('math', 'Ratios'),
  ('math', 'Statistics'),
  ('math', 'Exponential Functions'),
  ('math', 'Trigonometry'),
  ('math', 'Complex Numbers')
ON CONFLICT (subject, name) DO NOTHING;

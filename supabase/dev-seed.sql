-- ============================================================
-- dev-seed.sql — Rich development seed data
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/dev-seed.sql
-- ============================================================

BEGIN;

-- ── 1. Create auth users ──────────────────────────────────────────────────────

-- Admin
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@sat-platform.local',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "admin", "full_name": "Admin"}'::jsonb,
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Teacher
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'teacher@sat-platform.local',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "teacher", "full_name": "Nguyễn Văn Thầy"}'::jsonb,
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Students
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
(
  'bbbbbbbb-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student1@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Trần Thị An"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student2@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Lê Văn Bình"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student3@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Phạm Ngọc Chi"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student4@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Hoàng Minh Đức"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student5@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Ngô Thị Emmi"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student6@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Vũ Thành Phát"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student7@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Đinh Khánh Giang"}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  'bbbbbbbb-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student8@gmail.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "student", "full_name": "Trương Bảo Hân"}'::jsonb,
  now(), now(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Create application profiles explicitly ────────────────────────────────

INSERT INTO public.profiles (id, email, role, full_name, is_active, is_approved)
SELECT
  u.id,
  lower(u.email),
  COALESCE((u.raw_user_meta_data->>'role')::public.user_role, 'student'),
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  true,
  true
FROM auth.users u
WHERE u.id IN (
  'aaaaaaaa-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000004',
  'bbbbbbbb-0000-0000-0000-000000000005',
  'bbbbbbbb-0000-0000-0000-000000000006',
  'bbbbbbbb-0000-0000-0000-000000000007',
  'bbbbbbbb-0000-0000-0000-000000000008'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  is_active = EXCLUDED.is_active,
  is_approved = EXCLUDED.is_approved,
  updated_at = now();

-- ── 3. Set roles and phones in profiles ──────────────────────────────────────

UPDATE public.profiles SET
  role = 'teacher',
  full_name = 'Nguyễn Văn Thầy',
  phone = '0901234567'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

UPDATE public.profiles SET phone = '0911111111' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
UPDATE public.profiles SET phone = '0922222222' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.profiles SET phone = '0933333333' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003';
UPDATE public.profiles SET phone = '0944444444' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000004';
UPDATE public.profiles SET phone = '0955555555' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000005';
UPDATE public.profiles SET phone = '0966666666' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000006';
UPDATE public.profiles SET phone = '0977777777' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000007';
UPDATE public.profiles SET phone = '0988888888' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000008';

-- Disable 1 student to show toggle feature
UPDATE public.profiles SET is_active = false WHERE id = 'bbbbbbbb-0000-0000-0000-000000000008';

-- ── 3. Courses ─────────────────────────────────────────────────────────────────

INSERT INTO public.courses (id, teacher_id, title, start_date, end_date, expires_at) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'SAT Spring 2025 — Intensive', '2025-03-01', '2025-05-31', '2025-06-30'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'SAT Fall 2025 — Foundation', '2025-09-01', '2025-11-30', '2025-12-31'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'SAT 2026 — Advanced', '2026-01-15', '2026-05-15', '2026-06-15'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   'SAT Summer 2026 — Intensive', '2026-05-18', '2026-08-15', '2027-08-15')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Classes ──────────────────────────────────────────────────────────────────

INSERT INTO public.classes (id, course_id, title, schedule_text) VALUES
  ('dddddddd-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'Lớp Sáng — Thứ 2,4,6',
   'Thứ 2, 4, 6 - 08:00 đến 10:00'),
  ('dddddddd-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000001',
   'Lớp Chiều — Thứ 3,5,7',
   'Thứ 3, 5, 7 - 14:00 đến 16:00'),
  ('dddddddd-0000-0000-0000-000000000003',
   'cccccccc-0000-0000-0000-000000000002',
   'Lớp Cơ Bản — Weekend',
   'Thứ 7, CN - 09:00 đến 12:00'),
  ('dddddddd-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000003',
   'Lớp Nâng Cao 2026',
   'Thứ 2, 4 - 18:00 đến 20:00'),
  ('dddddddd-0000-0000-0000-000000000005',
   'cccccccc-0000-0000-0000-000000000004',
   'Lớp Hè — Thứ 3,5',
   'Thứ 3, 5 - 18:00 đến 20:00')
ON CONFLICT (id) DO NOTHING;

-- ── 5. Weeks ────────────────────────────────────────────────────────────────────

INSERT INTO public.weeks (id, class_id, title, "order") VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Tuần 1 — Reading Foundations', 1),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Tuần 2 — Math Algebra', 2),
  ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'Tuần 3 — Advanced Reading', 3),
  ('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000002', 'Tuần 1 — Writing Skills', 1),
  ('eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000002', 'Tuần 2 — Math Data', 2),
  ('eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000005', 'Tuần 1 — Diagnostic', 1)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Enrollments ──────────────────────────────────────────────────────────────

INSERT INTO public.enrollments (class_id, student_id) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000005'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000006'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000007'),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000005'),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001')
ON CONFLICT (class_id, student_id) DO NOTHING;

-- ── 7. Questions ────────────────────────────────────────────────────────────────

-- Multiple choice questions
INSERT INTO public.questions (id, created_by, type, content, content_hash, difficulty) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'Which choice most logically completes the text? The scientist noted that the results were ______ with the hypothesis, suggesting further investigation was necessary.',
   'hash_mc_001', 'medium'),
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'The author of the passage primarily argues that urban green spaces are essential because they: A) reduce city temperatures B) increase property values C) improve mental health D) attract tourism',
   'hash_mc_002', 'easy'),
  ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'If 3x + 7 = 22, what is the value of x?',
   'hash_mc_003', 'easy'),
  ('ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'A circle has a radius of 5. What is the area of the circle? (Use π ≈ 3.14)',
   'hash_mc_004', 'medium'),
  ('ffffffff-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'Which punctuation best completes the sentence: "The experiment failed ______ the team decided to redesign the approach."',
   'hash_mc_005', 'medium'),
  ('ffffffff-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'In the equation y = 2x² - 4x + 1, what is the vertex of the parabola?',
   'hash_mc_006', 'hard'),
  ('ffffffff-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'The graph shows the population of three cities from 2000 to 2020. Which city had the greatest percent increase in population over this period?',
   'hash_mc_007', 'medium'),
  ('ffffffff-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'Which transition word best shows contrast in the following sentence: "Maria studied for weeks; ______, she still found the exam challenging."',
   'hash_mc_008', 'easy'),
  ('ffffffff-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'If a store offers a 25% discount on an item originally priced at $80, what is the sale price?',
   'hash_mc_009', 'easy'),
  ('ffffffff-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001',
   'multiple_choice',
   'A researcher wants to test whether a new fertilizer increases crop yield. Which experimental design would best support a causal conclusion?',
   'hash_mc_010', 'hard')
ON CONFLICT (id) DO NOTHING;

-- Short answer questions
INSERT INTO public.questions (id, created_by, type, content, content_hash, difficulty) VALUES
  ('ffffffff-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',
   'short_answer',
   'If 2x - 5 = 11, what is the value of x?',
   'hash_sa_001', 'easy'),
  ('ffffffff-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001',
   'short_answer',
   'A rectangle has a length of 12 cm and a width of 7 cm. What is the perimeter in centimeters?',
   'hash_sa_002', 'easy'),
  ('ffffffff-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001',
   'short_answer',
   'What is 15% of 240?',
   'hash_sa_003', 'medium')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Question Options ──────────────────────────────────────────────────────────

INSERT INTO public.question_options (question_id, label, content, is_correct, "order") VALUES
  -- Q1
  ('ffffffff-0000-0000-0000-000000000001', 'A', 'consistent', true, 1),
  ('ffffffff-0000-0000-0000-000000000001', 'B', 'contradictory', false, 2),
  ('ffffffff-0000-0000-0000-000000000001', 'C', 'irrelevant', false, 3),
  ('ffffffff-0000-0000-0000-000000000001', 'D', 'preliminary', false, 4),
  -- Q2
  ('ffffffff-0000-0000-0000-000000000002', 'A', 'reduce city temperatures', false, 1),
  ('ffffffff-0000-0000-0000-000000000002', 'B', 'increase property values', false, 2),
  ('ffffffff-0000-0000-0000-000000000002', 'C', 'improve mental health', true, 3),
  ('ffffffff-0000-0000-0000-000000000002', 'D', 'attract tourism', false, 4),
  -- Q3
  ('ffffffff-0000-0000-0000-000000000003', 'A', '3', false, 1),
  ('ffffffff-0000-0000-0000-000000000003', 'B', '5', true, 2),
  ('ffffffff-0000-0000-0000-000000000003', 'C', '7', false, 3),
  ('ffffffff-0000-0000-0000-000000000003', 'D', '9', false, 4),
  -- Q4
  ('ffffffff-0000-0000-0000-000000000004', 'A', '15.7', false, 1),
  ('ffffffff-0000-0000-0000-000000000004', 'B', '31.4', false, 2),
  ('ffffffff-0000-0000-0000-000000000004', 'C', '78.5', true, 3),
  ('ffffffff-0000-0000-0000-000000000004', 'D', '157.0', false, 4),
  -- Q5
  ('ffffffff-0000-0000-0000-000000000005', 'A', '; therefore,', false, 1),
  ('ffffffff-0000-0000-0000-000000000005', 'B', '; however,', false, 2),
  ('ffffffff-0000-0000-0000-000000000005', 'C', '; consequently,', false, 3),
  ('ffffffff-0000-0000-0000-000000000005', 'D', '; so,', true, 4),
  -- Q6
  ('ffffffff-0000-0000-0000-000000000006', 'A', '(1, -1)', true, 1),
  ('ffffffff-0000-0000-0000-000000000006', 'B', '(2, 1)', false, 2),
  ('ffffffff-0000-0000-0000-000000000006', 'C', '(-1, 1)', false, 3),
  ('ffffffff-0000-0000-0000-000000000006', 'D', '(0, 1)', false, 4),
  -- Q7
  ('ffffffff-0000-0000-0000-000000000007', 'A', 'City A', false, 1),
  ('ffffffff-0000-0000-0000-000000000007', 'B', 'City B', true, 2),
  ('ffffffff-0000-0000-0000-000000000007', 'C', 'City C', false, 3),
  ('ffffffff-0000-0000-0000-000000000007', 'D', 'All three equally', false, 4),
  -- Q8
  ('ffffffff-0000-0000-0000-000000000008', 'A', 'therefore', false, 1),
  ('ffffffff-0000-0000-0000-000000000008', 'B', 'moreover', false, 2),
  ('ffffffff-0000-0000-0000-000000000008', 'C', 'nevertheless', true, 3),
  ('ffffffff-0000-0000-0000-000000000008', 'D', 'similarly', false, 4),
  -- Q9
  ('ffffffff-0000-0000-0000-000000000009', 'A', '$55', false, 1),
  ('ffffffff-0000-0000-0000-000000000009', 'B', '$60', true, 2),
  ('ffffffff-0000-0000-0000-000000000009', 'C', '$65', false, 3),
  ('ffffffff-0000-0000-0000-000000000009', 'D', '$70', false, 4),
  -- Q10
  ('ffffffff-0000-0000-0000-000000000010', 'A', 'A survey of 100 farmers about their preferences', false, 1),
  ('ffffffff-0000-0000-0000-000000000010', 'B', 'A randomized controlled trial with two groups', true, 2),
  ('ffffffff-0000-0000-0000-000000000010', 'C', 'An observational study of existing farms', false, 3),
  ('ffffffff-0000-0000-0000-000000000010', 'D', 'A meta-analysis of previous studies', false, 4)
ON CONFLICT DO NOTHING;

-- ── 9. Accepted Answers (Short Answer) ──────────────────────────────────────────

INSERT INTO public.question_accepted_answers (question_id, answer_text) VALUES
  ('ffffffff-0000-0000-0000-000000000011', '8'),
  ('ffffffff-0000-0000-0000-000000000011', '8.0'),
  ('ffffffff-0000-0000-0000-000000000012', '38'),
  ('ffffffff-0000-0000-0000-000000000013', '36'),
  ('ffffffff-0000-0000-0000-000000000013', '36.0')
ON CONFLICT DO NOTHING;

-- ── 10. Assignments ──────────────────────────────────────────────────────────────

INSERT INTO public.assignments (id, created_by, title) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Reading & Writing — Module 1'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Math — Linear Equations Practice'),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Full Mixed Practice Test')
ON CONFLICT (id) DO NOTHING;

-- ── 11. Assignment Questions ──────────────────────────────────────────────────────

INSERT INTO public.assignment_questions (assignment_id, question_id, "order") VALUES
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 1),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 2),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000005', 3),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000008', 4),
  ('11111111-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', 1),
  ('11111111-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000006', 2),
  ('11111111-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000009', 3),
  ('11111111-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000011', 4),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 1),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002', 2),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000003', 3),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004', 4),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000007', 5),
  ('11111111-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000010', 6)
ON CONFLICT DO NOTHING;

-- ── 12. Assignment Instances ──────────────────────────────────────────────────────

INSERT INTO public.assignment_instances (
  id, assignment_id, class_id, week_id,
  deadline, is_timed, time_limit_seconds,
  shuffle_questions, shuffle_options, max_retakes, published_at
) VALUES
  -- Lớp Sáng — Tuần 1 — RW Module 1 (published, expired)
  ('22222222-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001',
   '2025-03-15 23:59:00+00', false, null, false, false, 2,
   '2025-03-08 07:00:00+00'),
  -- Lớp Sáng — Tuần 2 — Math (published, expired)
  ('22222222-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000002',
   '2025-03-22 23:59:00+00', true, 1800, false, true, 1,
   '2025-03-15 07:00:00+00'),
  -- Lớp Chiều — Tuần 1 — RW Module 1 (published, upcoming)
  ('22222222-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   'eeeeeeee-0000-0000-0000-000000000004',
   '2026-06-30 23:59:00+00', false, null, true, true, 3,
   '2026-05-10 07:00:00+00'),
  -- Lớp Chiều — Full Mixed (draft, not published)
  ('22222222-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000003',
   'dddddddd-0000-0000-0000-000000000002',
   'eeeeeeee-0000-0000-0000-000000000005',
   '2026-07-15 23:59:00+00', true, 3600, false, false, 1,
   null),
  -- Lớp Hè — Tuần 1 — Math (published, active)
  ('22222222-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000005',
   'eeeeeeee-0000-0000-0000-000000000006',
   '2026-06-07 23:59:00+00', true, 1800, false, false, 1,
   '2026-05-18 07:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- ── 13. Submissions ───────────────────────────────────────────────────────────────

INSERT INTO public.submissions (
  id, instance_id, student_id, attempt_number,
  status, raw_score, total_questions,
  started_at, submitted_at, time_spent_seconds
) VALUES
  ('33333333-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   1, 'submitted', 3, 4,
   '2025-03-14 08:00:00+00', '2025-03-14 08:18:00+00', 1080),
  ('33333333-0000-0000-0000-000000000002',
   '22222222-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002',
   1, 'submitted', 4, 4,
   '2025-03-14 09:00:00+00', '2025-03-14 09:12:00+00', 720),
  ('33333333-0000-0000-0000-000000000003',
   '22222222-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000003',
   1, 'submitted', 2, 4,
   '2025-03-14 10:00:00+00', '2025-03-14 10:25:00+00', 1500),
  ('33333333-0000-0000-0000-000000000004',
   '22222222-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000004',
   1, 'submitted', 1, 4,
   '2025-03-15 08:00:00+00', '2025-03-15 08:30:00+00', 1800),
  ('33333333-0000-0000-0000-000000000005',
   '22222222-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000001',
   1, 'submitted', 3, 4,
   '2025-03-21 08:00:00+00', '2025-03-21 08:22:00+00', 1320),
  ('33333333-0000-0000-0000-000000000006',
   '22222222-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',
   1, 'submitted', 2, 4,
   '2025-03-21 09:00:00+00', '2025-03-21 09:20:00+00', 1200),
  ('33333333-0000-0000-0000-000000000007',
   '22222222-0000-0000-0000-000000000003',
   'bbbbbbbb-0000-0000-0000-000000000005',
   1, 'in_progress', null, null,
   now(), null, null)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'Seed complete!' as status,
  (SELECT count(*) FROM auth.users) as users,
  (SELECT count(*) FROM public.profiles) as profiles,
  (SELECT count(*) FROM public.courses) as courses,
  (SELECT count(*) FROM public.classes) as classes,
  (SELECT count(*) FROM public.questions) as questions,
  (SELECT count(*) FROM public.enrollments) as enrollments,
  (SELECT count(*) FROM public.submissions) as submissions;

-- Migration: 20260613163013_backfill_question_bank_permissions.sql
-- RBAC follow-up (2/2) — existing teachers keep the question-bank access they have today.
-- Runs after 20260613163012 so the enum values are already committed.
INSERT INTO public.user_permissions (user_id, permission)
SELECT p.id, perm::public.permission
FROM public.profiles p
CROSS JOIN (VALUES
  ('questions:view'),
  ('questions:create'),
  ('questions:update'),
  ('questions:delete')
) AS v(perm)
WHERE p.role = 'teacher'
ON CONFLICT (user_id, permission) DO NOTHING;

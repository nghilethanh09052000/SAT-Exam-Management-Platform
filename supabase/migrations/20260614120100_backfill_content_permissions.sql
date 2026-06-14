-- Migration: 20260614120100_backfill_content_permissions.sql
-- RBAC follow-up (2/2) — existing teachers keep the exam-paper/assignment access they have
-- today. Runs after 20260614120000 so the enum values are already committed.
INSERT INTO public.user_permissions (user_id, permission)
SELECT p.id, perm::public.permission
FROM public.profiles p
CROSS JOIN (VALUES
  ('exam_papers:view'), ('exam_papers:create'), ('exam_papers:update'), ('exam_papers:delete'),
  ('assignments:view'), ('assignments:create'), ('assignments:update'), ('assignments:delete')
) AS v(perm)
WHERE p.role = 'teacher'
ON CONFLICT (user_id, permission) DO NOTHING;

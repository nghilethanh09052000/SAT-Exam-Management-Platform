ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:view';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:create';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:update';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:delete';

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

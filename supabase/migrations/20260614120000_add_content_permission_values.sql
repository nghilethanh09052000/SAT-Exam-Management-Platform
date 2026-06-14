-- Migration: 20260614120000_add_content_permission_values.sql
-- RBAC follow-up (1/2) — add exam_papers:* and assignments:* enum values.
-- Split from the backfill: Postgres forbids using a newly-added enum value in the SAME
-- transaction it was added ("unsafe use of new value", 55P04), so the ADD VALUEs must
-- commit before the backfill INSERT in 20260614120100 can reference them.
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'exam_papers:view';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'exam_papers:create';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'exam_papers:update';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'exam_papers:delete';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'assignments:view';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'assignments:create';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'assignments:update';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'assignments:delete';

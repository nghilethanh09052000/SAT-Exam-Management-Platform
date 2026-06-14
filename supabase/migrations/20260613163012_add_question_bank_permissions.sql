-- Migration: 20260613163012_add_question_bank_permissions.sql
-- RBAC follow-up (1/2) — add questions:* enum values.
-- Split from the backfill: Postgres forbids using a newly-added enum value in the SAME
-- transaction it was added ("unsafe use of new value", 55P04), so the ADD VALUEs must
-- commit before the backfill INSERT in 20260613163013 can reference them.
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:view';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:create';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:update';
ALTER TYPE public.permission ADD VALUE IF NOT EXISTS 'questions:delete';

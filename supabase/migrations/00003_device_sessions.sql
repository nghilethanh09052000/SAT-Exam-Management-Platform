-- Migration: 00003_device_sessions.sql
-- Tracks active login sessions per student. Enforces 1-device limit.

CREATE TABLE public.device_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token   TEXT NOT NULL,
  device_info     TEXT,
  logged_in_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_violation    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX idx_device_sessions_session_token ON public.device_sessions(session_token);
CREATE INDEX idx_device_sessions_last_active ON public.device_sessions(last_active_at DESC);

-- Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Student can read their own sessions
CREATE POLICY "device_sessions_select_own"
  ON public.device_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can read all sessions
CREATE POLICY "device_sessions_select_admin"
  ON public.device_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Teacher can read all sessions (for violation monitoring)
CREATE POLICY "device_sessions_select_teacher"
  ON public.device_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    )
  );

-- Allow insert/update by the user themselves (managed via service role in API routes)
CREATE POLICY "device_sessions_insert_own"
  ON public.device_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_sessions_update_own"
  ON public.device_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "device_sessions_delete_own"
  ON public.device_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

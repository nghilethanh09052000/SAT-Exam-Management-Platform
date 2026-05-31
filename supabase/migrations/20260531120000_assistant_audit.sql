-- ── Assistant audit log ────────────────────────────────────────────────────
-- Stores every tool call made by the AI assistant for auditing.
-- Admins can view this; teachers cannot.

CREATE TABLE IF NOT EXISTS public.assistant_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('teacher', 'admin')),
  tool_name   text NOT NULL,
  args        jsonb,
  result_ok   boolean,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by actor or recent activity
CREATE INDEX IF NOT EXISTS assistant_audit_actor_idx  ON public.assistant_audit (actor_id);
CREATE INDEX IF NOT EXISTS assistant_audit_time_idx   ON public.assistant_audit (created_at DESC);

-- RLS: service role (server) can insert; admins can read all; others cannot read
ALTER TABLE public.assistant_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_audit_admin_select"
  ON public.assistant_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = 'admin'
    )
  );

-- No direct INSERT policy — server always uses service role key

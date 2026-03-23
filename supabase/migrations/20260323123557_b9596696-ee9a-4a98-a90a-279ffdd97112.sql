
-- Table to track login attempts server-side
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

-- Index for fast lookups by email and time
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempted_at DESC);

-- RLS: only service_role can manage this table
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage login attempts" ON public.login_attempts
  FOR ALL TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Auto-cleanup: delete attempts older than 24h (via scheduled function)
-- We'll handle cleanup in the edge function itself

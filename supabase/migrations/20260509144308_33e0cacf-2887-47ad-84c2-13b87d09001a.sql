ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);
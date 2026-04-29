-- ============================================================
-- MFA UX HARDENING: Trusted devices (30d) + Recovery codes
-- ============================================================

-- 1. Trusted devices table (allows skipping TOTP for 30 days per device)
CREATE TABLE IF NOT EXISTS public.mfa_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_trusted_user ON public.mfa_trusted_devices(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mfa_trusted_hash ON public.mfa_trusted_devices(device_token_hash);

ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own trusted devices"
ON public.mfa_trusted_devices
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Recovery codes (5 single-use codes per user)
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON public.mfa_recovery_codes(user_id) WHERE used_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mfa_recovery_hash ON public.mfa_recovery_codes(code_hash);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own recovery codes"
ON public.mfa_recovery_codes
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own recovery codes"
ON public.mfa_recovery_codes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own recovery codes"
ON public.mfa_recovery_codes
FOR DELETE
USING (auth.uid() = user_id);

-- 3. RPC: Validate trusted device token (called from frontend on login)
CREATE OR REPLACE FUNCTION public.validate_trusted_device(_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL OR _token_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_id
  FROM public.mfa_trusted_devices
  WHERE user_id = auth.uid()
    AND device_token_hash = _token_hash
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.mfa_trusted_devices
  SET last_used_at = now()
  WHERE id = v_id;

  RETURN TRUE;
END;
$$;

-- 4. RPC: Consume a recovery code (returns true if valid)
CREATE OR REPLACE FUNCTION public.consume_recovery_code(_code_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL OR _code_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_id
  FROM public.mfa_recovery_codes
  WHERE user_id = auth.uid()
    AND code_hash = _code_hash
    AND used_at IS NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.mfa_recovery_codes
  SET used_at = now()
  WHERE id = v_id;

  RETURN TRUE;
END;
$$;

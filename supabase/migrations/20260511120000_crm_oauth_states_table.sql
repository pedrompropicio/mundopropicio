-- Migration 4: crm.oauth_states (single-use OAuth state tokens, 10 min TTL)
-- Already applied via MCP on 2026-05-11. File added for repo source-of-truth.

CREATE TABLE IF NOT EXISTS crm.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

COMMENT ON TABLE crm.oauth_states IS
  'Single-use OAuth state tokens. Created by frontend before redirect to platform, consumed by oauth callback edge function. Auto-expire 10 min after creation.';

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON crm.oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_company ON crm.oauth_states (company_id);

ALTER TABLE crm.oauth_states ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='insert_own_company'
  ) THEN
    CREATE POLICY insert_own_company ON crm.oauth_states
      FOR INSERT TO authenticated
      WITH CHECK (
        company_id = current_setting('app.company_id', true)::uuid
        AND user_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='select_own_company'
  ) THEN
    CREATE POLICY select_own_company ON crm.oauth_states
      FOR SELECT TO authenticated
      USING (company_id = current_setting('app.company_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON crm.oauth_states
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION crm.cleanup_expired_oauth_states()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM crm.oauth_states WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION crm.cleanup_expired_oauth_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.cleanup_expired_oauth_states() TO service_role;

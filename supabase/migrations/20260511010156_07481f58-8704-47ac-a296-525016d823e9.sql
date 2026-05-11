-- Consolida: tabela crm.oauth_states + crm.consume_oauth_state + crm.upsert_meta_connection + 3 wrappers public.crm_*
-- Tudo idempotente para correr seguro em Test (cria do zero) e em Live (replace, drift correction reaplica).

-- ============ Tabela oauth_states (single-use OAuth state tokens, 10 min TTL) ============
CREATE TABLE IF NOT EXISTS crm.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta','google','tiktok')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON crm.oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_company ON crm.oauth_states (company_id);

ALTER TABLE crm.oauth_states ENABLE ROW LEVEL SECURITY;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='insert_own_company') THEN
    CREATE POLICY insert_own_company ON crm.oauth_states FOR INSERT TO authenticated
      WITH CHECK (company_id = current_setting('app.company_id', true)::uuid AND user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='select_own_company') THEN
    CREATE POLICY select_own_company ON crm.oauth_states FOR SELECT TO authenticated
      USING (company_id = current_setting('app.company_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='oauth_states' AND policyname='service_role_bypass') THEN
    CREATE POLICY service_role_bypass ON crm.oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $pol$;

-- ============ crm.consume_oauth_state ============
CREATE OR REPLACE FUNCTION crm.consume_oauth_state(p_state_id UUID)
RETURNS TABLE (company_id UUID, user_id UUID, platform TEXT, valid BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public
AS $$
DECLARE
  v_state crm.oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v_state FROM crm.oauth_states WHERE id = p_state_id AND expires_at > now();
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::TEXT, FALSE;
    RETURN;
  END IF;
  DELETE FROM crm.oauth_states WHERE id = p_state_id;
  RETURN QUERY SELECT v_state.company_id, v_state.user_id, v_state.platform, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION crm.consume_oauth_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.consume_oauth_state(UUID) TO service_role;

-- ============ crm.upsert_meta_connection ============
CREATE OR REPLACE FUNCTION crm.upsert_meta_connection(
  p_company_id UUID, p_user_id UUID, p_external_business_id TEXT, p_external_business_name TEXT,
  p_access_token TEXT, p_token_type TEXT, p_expires_at TIMESTAMPTZ, p_master_key TEXT,
  p_available_ad_accounts JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public
AS $$
DECLARE
  v_connection_id UUID;
  v_encrypted     TEXT;
BEGIN
  v_encrypted := encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  INSERT INTO crm.ad_platform_connections (
    company_id, platform, external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, status, connected_by, connected_at,
    last_validated_at, consecutive_failures
  ) VALUES (
    p_company_id, 'meta', p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, 'active', p_user_id, now(),
    now(), 0
  )
  ON CONFLICT (company_id, platform) DO UPDATE SET
    external_business_id    = EXCLUDED.external_business_id,
    external_business_name  = EXCLUDED.external_business_name,
    access_token_encrypted  = EXCLUDED.access_token_encrypted,
    token_type              = EXCLUDED.token_type,
    expires_at              = EXCLUDED.expires_at,
    available_ad_accounts   = EXCLUDED.available_ad_accounts,
    status                  = 'active',
    connected_by            = EXCLUDED.connected_by,
    connected_at            = now(),
    disconnected_at         = NULL,
    last_validated_at       = now(),
    last_error              = NULL,
    consecutive_failures    = 0
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO service_role;

-- ============ Wrappers public.crm_* (incondicionais) ============
CREATE OR REPLACE FUNCTION public.crm_consume_oauth_state(p_state_id UUID)
RETURNS TABLE (company_id UUID, user_id UUID, platform TEXT, valid BOOLEAN)
LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
AS $$ SELECT * FROM crm.consume_oauth_state(p_state_id); $$;

REVOKE ALL ON FUNCTION public.crm_consume_oauth_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_consume_oauth_state(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_upsert_meta_connection(
  p_company_id UUID, p_user_id UUID, p_external_business_id TEXT, p_external_business_name TEXT,
  p_access_token TEXT, p_token_type TEXT, p_expires_at TIMESTAMPTZ, p_master_key TEXT,
  p_available_ad_accounts JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
AS $$ SELECT crm.upsert_meta_connection(p_company_id, p_user_id, p_external_business_id, p_external_business_name, p_access_token, p_token_type, p_expires_at, p_master_key, p_available_ad_accounts); $$;

REVOKE ALL ON FUNCTION public.crm_upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_upsert_meta_connection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_write_audit_log(
  p_company_id UUID, p_user_id UUID, p_action TEXT, p_entity_type TEXT, p_entity_id UUID,
  p_payload_before JSONB DEFAULT NULL, p_payload_after JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
AS $$ SELECT crm.write_audit_log(p_company_id, p_user_id, p_action, p_entity_type, p_entity_id, p_payload_before, p_payload_after, p_ip_address, p_user_agent); $$;

REVOKE ALL ON FUNCTION public.crm_write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
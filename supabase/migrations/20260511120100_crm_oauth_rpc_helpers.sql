-- Migration 5: RPC helpers for OAuth flow
-- Already applied via MCP on 2026-05-11. File added for repo source-of-truth.

CREATE OR REPLACE FUNCTION crm.consume_oauth_state(p_state_id UUID)
RETURNS TABLE (
  company_id UUID,
  user_id UUID,
  platform TEXT,
  valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_state crm.oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v_state
  FROM crm.oauth_states
  WHERE id = p_state_id AND expires_at > now();

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

CREATE OR REPLACE FUNCTION crm.upsert_meta_connection(
  p_company_id            UUID,
  p_user_id               UUID,
  p_external_business_id  TEXT,
  p_external_business_name TEXT,
  p_access_token          TEXT,
  p_token_type            TEXT,
  p_expires_at            TIMESTAMPTZ,
  p_master_key            TEXT,
  p_available_ad_accounts JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
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

CREATE OR REPLACE FUNCTION crm.decrypt_token(p_ciphertext TEXT, p_master_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(p_ciphertext, 'base64'), p_master_key);
END;
$$;

REVOKE ALL ON FUNCTION crm.decrypt_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.decrypt_token(TEXT, TEXT) TO service_role;

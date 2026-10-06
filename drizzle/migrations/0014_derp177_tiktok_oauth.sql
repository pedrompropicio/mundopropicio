ALTER TABLE crm.oauth_states ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE crm.ad_platform_connections ADD COLUMN IF NOT EXISTS oauth_meta jsonb;
COMMENT ON COLUMN crm.ad_platform_connections.oauth_meta IS 'D-ERP177: metadados do OAuth (ex.: TikTok scope e advertiser_ids devolvidos). Nunca contém tokens.';

CREATE OR REPLACE FUNCTION public.crm_tiktok_consume_oauth_state(p_state_id uuid)
RETURNS TABLE(company_id uuid, user_id uuid, connection_id uuid, valid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v crm.oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v FROM crm.oauth_states s WHERE s.id = p_state_id AND s.platform = 'tiktok' AND s.expires_at > now();
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, false; RETURN; END IF;
  DELETE FROM crm.oauth_states s WHERE s.id = p_state_id;
  RETURN QUERY SELECT v.company_id, v.user_id, v.connection_id, true;
END $$;

CREATE OR REPLACE FUNCTION public.crm_tiktok_store_token(p_connection_id uuid, p_access_token text, p_master_key text, p_oauth_meta jsonb, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public, extensions AS $$
BEGIN
  UPDATE crm.ad_platform_connections SET
    access_token_encrypted = encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64'),
    token_type = 'tiktok_business', oauth_meta = p_oauth_meta,
    status = 'active', last_error = NULL, consecutive_failures = 0,
    last_validated_at = now(), connected_at = now(), connected_by = coalesce(p_user_id, connected_by), disconnected_at = NULL
  WHERE id = p_connection_id AND platform = 'tiktok';
  IF NOT FOUND THEN RAISE EXCEPTION 'ligação TikTok não encontrada'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_get_tiktok_decrypted_token(p_connection_id uuid, p_master_key text)
RETURNS TABLE(access_token text) LANGUAGE sql SECURITY DEFINER SET search_path = crm, public, extensions AS $$
  SELECT pgp_sym_decrypt(decode(c.access_token_encrypted, 'base64'), p_master_key)::text
  FROM crm.ad_platform_connections c
  WHERE c.id = p_connection_id AND c.platform = 'tiktok' AND c.access_token_encrypted IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.crm_tiktok_consume_oauth_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_tiktok_store_token(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_get_tiktok_decrypted_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_tiktok_consume_oauth_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_tiktok_store_token(uuid, text, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_get_tiktok_decrypted_token(uuid, text) TO service_role;
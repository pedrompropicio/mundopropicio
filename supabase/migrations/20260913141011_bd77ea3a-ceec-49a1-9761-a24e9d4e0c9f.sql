CREATE OR REPLACE FUNCTION crm.upsert_artist_meta_connection(
  p_company_id uuid,
  p_artist_id uuid,
  p_user_id uuid,
  p_external_business_id text,
  p_external_business_name text,
  p_access_token text,
  p_token_type text,
  p_expires_at timestamptz,
  p_master_key text,
  p_available_ad_accounts jsonb DEFAULT NULL,
  p_status text DEFAULT 'pending_selection',
  p_selected_ad_account_id text DEFAULT NULL,
  p_selected_ad_account_name text DEFAULT NULL,
  p_selected_ad_account_currency text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public
AS $$
DECLARE
  v_id        uuid;
  v_encrypted text;
BEGIN
  v_encrypted := encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  INSERT INTO crm.ad_platform_connections (
    company_id, artist_id, connection_scope, platform,
    external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, selected_ad_account_id, selected_ad_account_name,
    selected_ad_account_currency, status, connected_by, connected_at,
    last_validated_at, last_error, consecutive_failures, disconnected_at
  ) VALUES (
    p_company_id, p_artist_id, 'artist', 'meta',
    p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, p_selected_ad_account_id, p_selected_ad_account_name,
    p_selected_ad_account_currency, p_status, p_user_id, now(),
    now(), NULL, 0, NULL
  )
  ON CONFLICT (company_id, artist_id, platform) WHERE artist_id IS NOT NULL DO UPDATE SET
    external_business_id         = EXCLUDED.external_business_id,
    external_business_name       = EXCLUDED.external_business_name,
    access_token_encrypted       = EXCLUDED.access_token_encrypted,
    token_type                   = EXCLUDED.token_type,
    expires_at                   = EXCLUDED.expires_at,
    available_ad_accounts        = EXCLUDED.available_ad_accounts,
    selected_ad_account_id       = EXCLUDED.selected_ad_account_id,
    selected_ad_account_name     = EXCLUDED.selected_ad_account_name,
    selected_ad_account_currency = EXCLUDED.selected_ad_account_currency,
    status                       = EXCLUDED.status,
    connected_by                 = EXCLUDED.connected_by,
    connected_at                 = now(),
    last_validated_at            = now(),
    last_error                   = NULL,
    consecutive_failures         = 0,
    disconnected_at              = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.upsert_artist_meta_connection(uuid,uuid,uuid,text,text,text,text,timestamptz,text,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.upsert_artist_meta_connection(uuid,uuid,uuid,text,text,text,text,timestamptz,text,jsonb,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_upsert_artist_meta_connection(
  p_company_id uuid,
  p_artist_id uuid,
  p_user_id uuid,
  p_external_business_id text,
  p_external_business_name text,
  p_access_token text,
  p_token_type text,
  p_expires_at timestamptz,
  p_master_key text,
  p_available_ad_accounts jsonb DEFAULT NULL,
  p_status text DEFAULT 'pending_selection',
  p_selected_ad_account_id text DEFAULT NULL,
  p_selected_ad_account_name text DEFAULT NULL,
  p_selected_ad_account_currency text DEFAULT NULL
)
RETURNS uuid
LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
AS $$ SELECT crm.upsert_artist_meta_connection(p_company_id, p_artist_id, p_user_id,
  p_external_business_id, p_external_business_name, p_access_token, p_token_type,
  p_expires_at, p_master_key, p_available_ad_accounts, p_status,
  p_selected_ad_account_id, p_selected_ad_account_name, p_selected_ad_account_currency); $$;

REVOKE ALL ON FUNCTION public.crm_upsert_artist_meta_connection(uuid,uuid,uuid,text,text,text,text,timestamptz,text,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_upsert_artist_meta_connection(uuid,uuid,uuid,text,text,text,text,timestamptz,text,jsonb,text,text,text,text) TO service_role;
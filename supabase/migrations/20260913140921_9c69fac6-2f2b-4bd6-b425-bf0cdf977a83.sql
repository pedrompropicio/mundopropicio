ALTER TABLE crm.ad_platform_connections
  ADD COLUMN IF NOT EXISTS artist_id uuid NULL REFERENCES public.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connection_scope text NOT NULL DEFAULT 'company';

ALTER TABLE crm.ad_platform_connections
  DROP CONSTRAINT IF EXISTS ad_platform_connections_connection_scope_check;
ALTER TABLE crm.ad_platform_connections
  ADD CONSTRAINT ad_platform_connections_connection_scope_check
  CHECK (connection_scope IN ('company', 'artist'));

ALTER TABLE crm.ad_platform_connections ALTER COLUMN access_token_encrypted DROP NOT NULL;
ALTER TABLE crm.ad_platform_connections ALTER COLUMN token_type DROP NOT NULL;

ALTER TABLE crm.ad_platform_connections DROP CONSTRAINT IF EXISTS ad_platform_connections_status_check;
ALTER TABLE crm.ad_platform_connections
  ADD CONSTRAINT ad_platform_connections_status_check
  CHECK (status IN ('active','expired','revoked','error','disconnected','pending_selection','pending_link'));

ALTER TABLE crm.ad_platform_connections DROP CONSTRAINT IF EXISTS one_active_per_company_platform;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conn_company_platform_company_scope
  ON crm.ad_platform_connections (company_id, platform) WHERE artist_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conn_company_artist_platform
  ON crm.ad_platform_connections (company_id, artist_id, platform) WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connections_company_artist_platform
  ON crm.ad_platform_connections (company_id, artist_id, platform);

COMMENT ON COLUMN crm.ad_platform_connections.artist_id IS
  'D-ERP57: quando preenchido, a ligacao e a conta de anuncios do proprio artista (connection_scope=artist). A linha continua a pertencer a empresa gestora.';

ALTER TABLE crm.oauth_states
  ADD COLUMN IF NOT EXISTS artist_id uuid NULL REFERENCES public.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_url text NULL;

DROP FUNCTION IF EXISTS public.crm_consume_oauth_state(UUID);
DROP FUNCTION IF EXISTS crm.consume_oauth_state(UUID);
CREATE FUNCTION crm.consume_oauth_state(p_state_id UUID)
RETURNS TABLE (company_id UUID, user_id UUID, platform TEXT, valid BOOLEAN, artist_id UUID, return_url TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public
AS $$
DECLARE
  v_state crm.oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v_state FROM crm.oauth_states WHERE id = p_state_id AND expires_at > now();
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  DELETE FROM crm.oauth_states WHERE id = p_state_id;
  RETURN QUERY SELECT v_state.company_id, v_state.user_id, v_state.platform, TRUE,
                      v_state.artist_id, v_state.return_url;
END;
$$;
REVOKE ALL ON FUNCTION crm.consume_oauth_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.consume_oauth_state(UUID) TO service_role;

CREATE FUNCTION public.crm_consume_oauth_state(p_state_id UUID)
RETURNS TABLE (company_id UUID, user_id UUID, platform TEXT, valid BOOLEAN, artist_id UUID, return_url TEXT)
LANGUAGE SQL SECURITY DEFINER SET search_path = public, crm
AS $$ SELECT * FROM crm.consume_oauth_state(p_state_id); $$;
REVOKE ALL ON FUNCTION public.crm_consume_oauth_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_consume_oauth_state(UUID) TO service_role;

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
  ON CONFLICT (company_id, platform) WHERE artist_id IS NULL DO UPDATE SET
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

CREATE OR REPLACE FUNCTION public.artist_ads_register_external(
  p_artist_id uuid,
  p_platform text,
  p_external_id text,
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, crm
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_ok      boolean;
  v_id      uuid;
  v_ext     text;
BEGIN
  IF p_platform NOT IN ('google', 'tiktok') THEN
    RAISE EXCEPTION 'plataforma invalida: %', p_platform;
  END IF;

  v_ext := regexp_replace(coalesce(p_external_id, ''), '\D', '', 'g');
  IF v_ext = '' THEN
    RAISE EXCEPTION 'external_id invalido';
  END IF;

  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'artista nao encontrado';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.role IN ('admin','platform_admin','manager','marketing_manager')
        AND (ur.role = 'platform_admin' OR ur.company_id IS NULL OR ur.company_id = v_company)
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'sem permissao para registar contas de anuncios deste artista';
    END IF;
  END IF;

  INSERT INTO crm.ad_platform_connections (
    company_id, artist_id, connection_scope, platform,
    external_business_id, external_business_name,
    status, connected_by, connected_at
  ) VALUES (
    v_company, p_artist_id, 'artist', p_platform,
    v_ext, p_name,
    'pending_link', v_uid, now()
  )
  ON CONFLICT (company_id, artist_id, platform) WHERE artist_id IS NOT NULL DO UPDATE SET
    external_business_id   = EXCLUDED.external_business_id,
    external_business_name = coalesce(EXCLUDED.external_business_name, crm.ad_platform_connections.external_business_name),
    disconnected_at        = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.artist_ads_register_external(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_register_external(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_register_external(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_register_external(uuid, text, text, text) TO service_role;
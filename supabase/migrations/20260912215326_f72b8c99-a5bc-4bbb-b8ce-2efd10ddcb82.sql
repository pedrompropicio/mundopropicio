ALTER TABLE public.artist_channel_connections
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;

COMMENT ON COLUMN public.artist_channel_connections.refresh_token_encrypted IS
  'Refresh token cifrado (pgp_sym_encrypt + base64) com ENCRYPTION_MASTER_KEY. Usado pelo TikTok (365 dias).';
COMMENT ON COLUMN public.artist_channel_connections.refresh_expires_at IS
  'Validade do refresh token (TikTok: agora + refresh_expires_in).';

CREATE OR REPLACE FUNCTION public.artist_upsert_channel_connection(
  p_artist_channel_id uuid,
  p_company_id uuid,
  p_artist_id uuid,
  p_provider text,
  p_access_token text,
  p_master_key text,
  p_external_account_id text DEFAULT NULL::text,
  p_external_account_username text DEFAULT NULL::text,
  p_external_page_id text DEFAULT NULL::text,
  p_external_page_name text DEFAULT NULL::text,
  p_token_type text DEFAULT NULL::text,
  p_scopes text[] DEFAULT NULL::text[],
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_connected_by uuid DEFAULT NULL::uuid,
  p_refresh_token text DEFAULT NULL::text,
  p_refresh_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_enc text;
  v_refresh_enc text;
BEGIN
  v_enc := encode(extensions.pgp_sym_encrypt(p_access_token, p_master_key), 'base64');
  IF p_refresh_token IS NOT NULL AND p_refresh_token <> '' THEN
    v_refresh_enc := encode(extensions.pgp_sym_encrypt(p_refresh_token, p_master_key), 'base64');
  END IF;

  INSERT INTO public.artist_channel_connections (
    company_id, artist_id, artist_channel_id, provider,
    external_account_id, external_account_username, external_page_id, external_page_name,
    access_token_encrypted, refresh_token_encrypted, token_type, scopes,
    expires_at, refresh_expires_at,
    status, last_validated_at, last_error, consecutive_failures, connected_by, connected_at
  ) VALUES (
    p_company_id, p_artist_id, p_artist_channel_id, p_provider,
    p_external_account_id, p_external_account_username, p_external_page_id, p_external_page_name,
    v_enc, v_refresh_enc, p_token_type, p_scopes,
    p_expires_at, p_refresh_expires_at,
    'active', now(), NULL, 0, p_connected_by, now()
  )
  ON CONFLICT (artist_channel_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    artist_id = EXCLUDED.artist_id,
    provider = EXCLUDED.provider,
    external_account_id = EXCLUDED.external_account_id,
    external_account_username = EXCLUDED.external_account_username,
    external_page_id = EXCLUDED.external_page_id,
    external_page_name = EXCLUDED.external_page_name,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, public.artist_channel_connections.refresh_token_encrypted),
    token_type = EXCLUDED.token_type,
    scopes = EXCLUDED.scopes,
    expires_at = EXCLUDED.expires_at,
    refresh_expires_at = COALESCE(EXCLUDED.refresh_expires_at, public.artist_channel_connections.refresh_expires_at),
    status = 'active',
    last_validated_at = now(),
    last_error = NULL,
    consecutive_failures = 0,
    connected_by = EXCLUDED.connected_by,
    connected_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.artist_upsert_channel_connection(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text[],
  timestamptz, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_upsert_channel_connection(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text[],
  timestamptz, uuid, text, timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.artist_upsert_channel_connection(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text[],
  timestamptz, uuid);

DROP FUNCTION IF EXISTS public.artist_get_connection_token(uuid, text);

CREATE FUNCTION public.artist_get_connection_token(p_connection_id uuid, p_master_key text)
RETURNS TABLE(
  access_token text,
  refresh_token text,
  company_id uuid,
  artist_id uuid,
  artist_channel_id uuid,
  external_account_id text,
  external_page_id text,
  provider text,
  token_type text,
  expires_at timestamptz,
  refresh_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT extensions.pgp_sym_decrypt(decode(c.access_token_encrypted, 'base64'), p_master_key)::text,
         CASE
           WHEN c.refresh_token_encrypted IS NULL THEN NULL
           ELSE extensions.pgp_sym_decrypt(decode(c.refresh_token_encrypted, 'base64'), p_master_key)::text
         END,
         c.company_id, c.artist_id, c.artist_channel_id,
         c.external_account_id, c.external_page_id, c.provider,
         c.token_type, c.expires_at, c.refresh_expires_at
  FROM public.artist_channel_connections c
  WHERE c.id = p_connection_id AND c.status = 'active';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.artist_get_connection_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_get_connection_token(uuid, text) TO service_role;
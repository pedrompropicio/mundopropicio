-- Helpers service_role-only para artist_channel_connections (tokens cifrados)

CREATE OR REPLACE FUNCTION public.artist_upsert_channel_connection(
  p_artist_channel_id uuid,
  p_company_id uuid,
  p_artist_id uuid,
  p_provider text,
  p_access_token text,
  p_master_key text,
  p_external_account_id text DEFAULT NULL,
  p_external_account_username text DEFAULT NULL,
  p_external_page_id text DEFAULT NULL,
  p_external_page_name text DEFAULT NULL,
  p_token_type text DEFAULT NULL,
  p_scopes text[] DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_connected_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_enc text;
BEGIN
  v_enc := encode(extensions.pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  INSERT INTO public.artist_channel_connections (
    company_id, artist_id, artist_channel_id, provider,
    external_account_id, external_account_username, external_page_id, external_page_name,
    access_token_encrypted, token_type, scopes, expires_at,
    status, last_validated_at, last_error, consecutive_failures, connected_by, connected_at
  ) VALUES (
    p_company_id, p_artist_id, p_artist_channel_id, p_provider,
    p_external_account_id, p_external_account_username, p_external_page_id, p_external_page_name,
    v_enc, p_token_type, p_scopes, p_expires_at,
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
    token_type = EXCLUDED.token_type,
    scopes = EXCLUDED.scopes,
    expires_at = EXCLUDED.expires_at,
    status = 'active',
    last_validated_at = now(),
    last_error = NULL,
    consecutive_failures = 0,
    connected_by = EXCLUDED.connected_by,
    connected_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.artist_get_connection_token(p_connection_id uuid, p_master_key text)
RETURNS TABLE(
  access_token text, company_id uuid, artist_id uuid, artist_channel_id uuid,
  external_account_id text, external_page_id text, provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT extensions.pgp_sym_decrypt(decode(c.access_token_encrypted, 'base64'), p_master_key)::text,
         c.company_id, c.artist_id, c.artist_channel_id,
         c.external_account_id, c.external_page_id, c.provider
  FROM public.artist_channel_connections c
  WHERE c.id = p_connection_id AND c.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.artist_mark_connection_status(
  p_connection_id uuid, p_status text, p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.artist_channel_connections SET
    status = p_status,
    last_error = p_error,
    last_validated_at = CASE WHEN p_status = 'active' THEN now() ELSE last_validated_at END,
    consecutive_failures = CASE WHEN p_status = 'active' THEN 0 ELSE consecutive_failures + 1 END
  WHERE id = p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.artist_delete_channel_connection(p_artist_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.artist_channel_connections WHERE artist_channel_id = p_artist_channel_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.artist_upsert_channel_connection(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],timestamptz,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.artist_get_connection_token(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.artist_mark_connection_status(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.artist_delete_channel_connection(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.artist_upsert_channel_connection(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_get_connection_token(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_mark_connection_status(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_delete_channel_connection(uuid) TO service_role;
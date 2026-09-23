SET lock_timeout = '5s';
ALTER TABLE public.artist_channel_connections
  DROP CONSTRAINT artist_channel_connections_provider_check,
  ADD CONSTRAINT artist_channel_connections_provider_check
    CHECK (provider = ANY (ARRAY['meta','instagram','google','tiktok','spotify']));

SET lock_timeout = '5s';
ALTER TABLE public.artist_channel_connections
  ADD COLUMN IF NOT EXISTS oauth_client_id text,
  ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz;

CREATE OR REPLACE FUNCTION public.artist_channel_refresh_lease(
  p_connection_id uuid, p_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE public.artist_channel_connections
     SET refresh_lock_until = now() + make_interval(secs => greatest(10, least(p_seconds, 300)))
   WHERE id = p_connection_id
     AND (refresh_lock_until IS NULL OR refresh_lock_until < now());
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.artist_channel_refresh_lease(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_channel_refresh_lease(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.artist_channel_store_rotated_tokens(
  p_connection_id uuid, p_master_key text, p_access_token text,
  p_refresh_token text, p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  IF coalesce(p_access_token,'') = '' OR coalesce(p_refresh_token,'') = '' THEN
    RAISE EXCEPTION 'tokens vazios' USING ERRCODE = '22023';
  END IF;
  UPDATE public.artist_channel_connections
     SET access_token_encrypted  = encode(extensions.pgp_sym_encrypt(p_access_token,  p_master_key), 'base64'),
         refresh_token_encrypted = encode(extensions.pgp_sym_encrypt(p_refresh_token, p_master_key), 'base64'),
         expires_at = p_expires_at, refresh_lock_until = NULL,
         status = 'active', last_validated_at = now(), last_error = NULL,
         consecutive_failures = 0, updated_at = now()
   WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ligação % não existe', p_connection_id USING ERRCODE = 'P0002';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.artist_channel_store_rotated_tokens(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_channel_store_rotated_tokens(uuid, text, text, text, timestamptz) TO service_role;
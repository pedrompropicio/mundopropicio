CREATE TABLE public.artist_channel_seed_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('spotify')),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz);
ALTER TABLE public.artist_channel_seed_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_channel_seed_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.artist_channel_seed_codes TO service_role;

CREATE FUNCTION public.artist_s4a_seed_code_create(p_artist_id uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $f$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_code text; v_exp timestamptz := now() + interval '10 minutes';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE = '42501'; END IF;
  SELECT a.company_id INTO v_company FROM public.artists a WHERE a.id = p_artist_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'artista inexistente' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_platform_admin(v_uid) OR EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = v_uid AND ur.company_id = v_company
           AND ur.role::text IN ('admin','platform_admin'))) THEN
    RAISE EXCEPTION 'sem permissão (admin da empresa do artista)' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.artist_channels ch
                  WHERE ch.artist_id = p_artist_id AND ch.platform = 'spotify') THEN
    RAISE EXCEPTION 'o artista não tem canal Spotify registado' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.artist_channel_seed_codes s SET used_at = now()
   WHERE s.provider = 'spotify' AND s.artist_id = p_artist_id AND s.used_at IS NULL;
  v_code := 'S4A-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));
  INSERT INTO public.artist_channel_seed_codes
    (provider, artist_id, company_id, code_hash, created_by, expires_at)
  VALUES ('spotify', p_artist_id, v_company,
          encode(extensions.digest(v_code, 'sha256'), 'hex'), v_uid, v_exp);
  RETURN QUERY SELECT v_code, v_exp;
END $f$;
REVOKE ALL ON FUNCTION public.artist_s4a_seed_code_create(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_s4a_seed_code_create(uuid) TO authenticated, service_role;

CREATE FUNCTION public.artist_s4a_seed_code_consume(p_code text)
RETURNS TABLE(artist_id uuid, company_id uuid, created_by uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $f$
BEGIN
  RETURN QUERY
    UPDATE public.artist_channel_seed_codes s
       SET used_at = now()
     WHERE s.code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
       AND s.provider = 'spotify' AND s.used_at IS NULL AND s.expires_at > now()
    RETURNING s.artist_id, s.company_id, s.created_by;
END $f$;
REVOKE ALL ON FUNCTION public.artist_s4a_seed_code_consume(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_s4a_seed_code_consume(text) TO service_role;
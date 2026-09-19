-- D-ERP90: núcleo da ligação campanha→música sem verificação de acesso,
-- para poder ser usado pelos crons de sync (Meta job 241 / Google job 242).
CREATE OR REPLACE FUNCTION crm.artist_ads_autolink_songs_core(p_artist_id uuid, p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_total int := 0; v_n int;
BEGIN
  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = p_company_id
  ), gmatch AS (
    SELECT DISTINCT ON (gc.id) gc.id AS campaign_row, s.id AS song_id
    FROM crm.google_campaign gc
    JOIN crm.ad_platform_connections c ON c.id = gc.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(gc.name) LIKE '%'||s.bt||'%'
    WHERE gc.linked_song_id IS NULL
    ORDER BY gc.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.google_campaign gc SET linked_song_id = m.song_id
  FROM gmatch m WHERE gc.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = p_company_id
  ), mmatch AS (
    SELECT DISTINCT ON (ms.id) ms.id AS campaign_row, s.id AS song_id
    FROM crm.meta_campaign_snapshot ms
    JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(ms.name) LIKE '%'||s.bt||'%'
    WHERE ms.linked_song_id IS NULL
    ORDER BY ms.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.meta_campaign_snapshot ms SET linked_song_id = m.song_id
  FROM mmatch m WHERE ms.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END $function$;

REVOKE EXECUTE ON FUNCTION crm.artist_ads_autolink_songs_core(uuid, uuid) FROM PUBLIC;

-- Versão do utilizador: assinatura e retorno inalterados.
CREATE OR REPLACE FUNCTION public.artist_ads_autolink_songs(p_artist_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  RETURN crm.artist_ads_autolink_songs_core(p_artist_id, v_company);
END $function$;

-- Versão para cron/service_role: resolve a empresa pelo artista, sem auth.uid().
CREATE OR REPLACE FUNCTION public.artist_ads_autolink_songs_internal(p_artist_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'artista inexistente ou sem empresa' USING ERRCODE = '42501';
  END IF;
  RETURN crm.artist_ads_autolink_songs_core(p_artist_id, v_company);
END $function$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_autolink_songs_internal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.artist_ads_autolink_songs_internal(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_autolink_songs_internal(uuid) TO service_role;
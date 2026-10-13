-- D-ERP259 fase 2: leitura directa das tabelas de artista limitada aos artistas
-- que o utilizador pode ler (papel real na empresa, atribuição, ou platform_admin).
-- Fecha também a leitura dada pelo papel automático 'user'.
CREATE OR REPLACE FUNCTION public.artist_readable_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id FROM public.artists a
  WHERE public.has_role(auth.uid(),'platform_admin'::app_role)
     OR EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.company_id = a.company_id AND ur.role <> 'user')
     OR EXISTS (SELECT 1 FROM public.artist_user_access x
                WHERE x.user_id = auth.uid() AND x.artist_id = a.id AND x.revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.artist_readable_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_readable_ids() TO authenticated, service_role;

CREATE POLICY artist_scope_select ON public.artists AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id IN (SELECT public.artist_readable_ids()));

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'artist_ads_alert_log','artist_ads_campaign_goals','artist_aliases','artist_audience_demographics',
    'artist_channels','artist_comparables','artist_content','artist_content_metrics_daily',
    'artist_metrics_daily','artist_release_metrics_daily','artist_releases','artist_song_metrics_daily',
    'artist_song_playlist_streams','artist_song_reports','artist_song_tiktok_groups',
    'artist_song_tiktok_sounds','artist_songs','song_links','artist_song_identifiers'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='artist_id') THEN
      EXECUTE format(
        'CREATE POLICY artist_scope_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
           USING (artist_id IS NULL OR artist_id IN (SELECT public.artist_readable_ids()))', t);
    ELSIF t = 'artist_song_identifiers' THEN
      EXECUTE 'CREATE POLICY artist_scope_select ON public.artist_song_identifiers AS RESTRICTIVE FOR SELECT TO authenticated
           USING (song_id IN (SELECT s.id FROM public.artist_songs s WHERE s.artist_id IN (SELECT public.artist_readable_ids())))';
    END IF;
  END LOOP;
END $do$;
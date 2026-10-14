-- D-ERP259 adenda: quem tem acesso por artista (artist_user_access) passa o
-- isolamento por empresa nas tabelas de artistas. O âmbito por artista
-- (artist_scope_select) e as políticas de escrita continuam a decidir.
CREATE OR REPLACE FUNCTION public.artist_assignment_company_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT a.company_id FROM public.artist_user_access x
  JOIN public.artists a ON a.id = x.artist_id
  WHERE x.user_id = auth.uid() AND x.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.artist_assignment_company_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_assignment_company_ids() TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['artist_aliases','artist_audience_demographics','artist_channels','artist_comparables','artist_content','artist_content_metrics_daily','artist_metrics_daily','artist_release_metrics_daily','artist_releases','artist_song_metrics_daily','artist_song_playlist_streams','artist_song_playlists','artist_song_reports','artist_song_tiktok_groups','artist_song_tiktok_sounds','artist_songs','artists'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_isolation_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO public
      USING (public.user_has_company_access(company_id) OR company_id IN (SELECT public.artist_assignment_company_ids()))
      WITH CHECK (public.user_has_company_access(company_id) OR company_id IN (SELECT public.artist_assignment_company_ids()))',
      'company_isolation_'||t, t);
  END LOOP;
END $$;
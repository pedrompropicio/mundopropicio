-- D-ERP259 fase 2 com áreas: leitura directa por área via artist_access_ok(artist,'read',área).
-- Acesso avaliado uma vez por pedido (função STABLE em subplano), nunca por linha.
CREATE OR REPLACE FUNCTION public.artist_readable_ids_for(p_areas text[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.artist_readable_ids() id
  WHERE EXISTS (SELECT 1 FROM unnest(p_areas) ar WHERE public.artist_access_ok(id, 'read', ar))
$$;
REVOKE ALL ON FUNCTION public.artist_readable_ids_for(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_readable_ids_for(text[]) TO authenticated, service_role;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('artist_channels', '{overview,channels}'), ('artist_metrics_daily', '{overview,channels}'),
    ('artist_songs', '{songs}'), ('artist_song_metrics_daily', '{songs}'),
    ('artist_song_reports', '{songs}'), ('artist_comparables', '{songs}'),
    ('artist_releases', '{songs}'), ('artist_release_metrics_daily', '{songs}'),
    ('artist_content', '{content}'), ('artist_content_metrics_daily', '{content}')
  ) v(t, areas) LOOP
    EXECUTE format('DROP POLICY IF EXISTS artist_scope_select ON public.%I', r.t);
    EXECUTE format(
      'CREATE POLICY artist_scope_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
         USING (artist_id IS NULL OR artist_id IN (SELECT public.artist_readable_ids_for(%L::text[])))', r.t, r.areas);
  END LOOP;
END $do$;

DROP POLICY IF EXISTS artist_scope_select ON public.artist_song_identifiers;
CREATE POLICY artist_scope_select ON public.artist_song_identifiers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (song_id IN (SELECT s.id FROM public.artist_songs s
                     WHERE s.artist_id IN (SELECT public.artist_readable_ids_for('{songs}'::text[]))));

DROP POLICY IF EXISTS artist_scope_select ON public.artist_song_playlists;
CREATE POLICY artist_scope_select ON public.artist_song_playlists AS RESTRICTIVE FOR SELECT TO authenticated
  USING (song_id IN (SELECT s.id FROM public.artist_songs s
                     WHERE s.artist_id IN (SELECT public.artist_readable_ids_for('{songs}'::text[]))));

DO $do$
DECLARE fn text; d0 text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['artist_growth_summary_rows','artist_momentum_rows'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=fn AND p.prokind='f';
    IF position('public.artist_readable_ids()' IN d0)=0 THEN RAISE EXCEPTION 'D-ERP259: texto não encontrado em %', fn; END IF;
    EXECUTE replace(d0, 'public.artist_readable_ids()', 'public.artist_readable_ids_for(''{overview,channels}''::text[])');
  END LOOP;
  SELECT pg_get_functiondef('public._content_latest_metrics'::regproc) INTO d0;
  IF position('public.artist_readable_ids()' IN d0)=0 THEN RAISE EXCEPTION 'D-ERP259: _content_latest_metrics'; END IF;
  EXECUTE replace(d0, 'public.artist_readable_ids()', 'public.artist_readable_ids_for(''{content}''::text[])');
END $do$;

GRANT SELECT ON crm.artist_ads_budget_changes TO authenticated;
DROP POLICY IF EXISTS artist_scope_select ON crm.artist_ads_budget_changes;
CREATE POLICY artist_scope_select ON crm.artist_ads_budget_changes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (artist_id IN (SELECT public.artist_readable_ids_for('{traffic}'::text[])));
DROP POLICY IF EXISTS artist_access_traffic_select ON crm.artist_ads_budget_changes;
CREATE POLICY artist_access_traffic_select ON crm.artist_ads_budget_changes FOR SELECT TO authenticated
  USING (artist_id IN (SELECT public.artist_readable_ids_for('{traffic}'::text[])));
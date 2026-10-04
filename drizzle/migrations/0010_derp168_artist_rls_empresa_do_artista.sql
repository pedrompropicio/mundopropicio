-- D-ERP168: a Gestão Artística deixa de depender da empresa ativa (profiles.active_company_id).
-- Isolamento e escritas passam a verificar o papel do utilizador na empresa da LINHA.
-- Nomes, comandos, papéis-alvo e tipo (PERMISSIVE/RESTRICTIVE) das políticas mantêm-se.
-- has_role() e current_company_id() não são alterados (o ERP continua igual).
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.user_has_company_access(p_company_id uuid, p_roles public.app_role[] DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = p_company_id
        AND (p_roles IS NULL OR ur.role = ANY (p_roles))
    )
  )
$function$;
REVOKE ALL ON FUNCTION public.user_has_company_access(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_company_access(uuid, public.app_role[]) TO authenticated, service_role;

-- Tipo A: <t>_delete / <t>_insert / <t>_update (admin|platform_admin|manager|editor) + company_isolation_<t> (RESTRICTIVE ALL).
-- Tipo B: <t>_write (FOR ALL, mesmos papéis) + company_isolation_<t>.
DO $do$
DECLARE
  t text;
  w text := 'public.user_has_company_access(company_id, ARRAY[''admin'',''manager'',''editor'']::public.app_role[])';
  i text := 'public.user_has_company_access(company_id)';
BEGIN
  FOREACH t IN ARRAY ARRAY['artists','artist_aliases','artist_audience_demographics','artist_channels','artist_comparables',
    'artist_content','artist_content_metrics_daily','artist_metrics_daily','artist_release_metrics_daily','artist_releases','artist_songs'] LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)', t||'_delete', t, w);
    EXECUTE format('DROP POLICY %I ON public.%I', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)', t||'_insert', t, w);
    EXECUTE format('DROP POLICY %I ON public.%I', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t||'_update', t, w, w);
    EXECUTE format('DROP POLICY %I ON public.%I', 'company_isolation_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', 'company_isolation_'||t, t, i, i);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['artist_song_metrics_daily','artist_song_playlist_streams','artist_song_playlists','artist_song_reports',
    'artist_song_tiktok_groups','artist_song_tiktok_sound_daily','artist_song_tiktok_sounds'] LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', t||'_write', t, w, w);
    EXECUTE format('DROP POLICY %I ON public.%I', 'company_isolation_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', 'company_isolation_'||t, t, i, i);
  END LOOP;
END
$do$;

-- Tipo C (casos próprios)
DROP POLICY "goals_select_company_members" ON public.artist_ads_campaign_goals;
CREATE POLICY "goals_select_company_members" ON public.artist_ads_campaign_goals AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.user_has_company_access(company_id));

DROP POLICY "song_links_select_company" ON public.song_links;
CREATE POLICY "song_links_select_company" ON public.song_links AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.user_has_company_access(company_id));

DROP POLICY "artist_song_identifiers_select" ON public.artist_song_identifiers;
CREATE POLICY "artist_song_identifiers_select" ON public.artist_song_identifiers AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.artist_songs s
                 WHERE s.id = artist_song_identifiers.song_id AND public.user_has_company_access(s.company_id)));
DROP POLICY "artist_song_identifiers_write" ON public.artist_song_identifiers;
CREATE POLICY "artist_song_identifiers_write" ON public.artist_song_identifiers AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.artist_songs s
                 WHERE s.id = artist_song_identifiers.song_id
                   AND public.user_has_company_access(s.company_id, ARRAY['admin','manager','editor']::public.app_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_songs s
                 WHERE s.id = artist_song_identifiers.song_id
                   AND public.user_has_company_access(s.company_id, ARRAY['admin','manager','editor']::public.app_role[])));

-- RPCs: papel na empresa do artista/música/vídeo (padrão artist_ads_assert_access/assert_write).
CREATE OR REPLACE FUNCTION public.artist_ads_connections(p_artist_id uuid)
 RETURNS TABLE(id uuid, platform text, status text, external_business_id text, external_business_name text, selected_ad_account_id text, selected_ad_account_name text, selected_ad_account_currency text, available_ad_accounts jsonb, connected_at timestamp with time zone, disconnected_at timestamp with time zone, last_error text, expires_at timestamp with time zone, last_synced_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  SELECT c.id, c.platform, c.status, c.external_business_id, c.external_business_name,
         c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency,
         c.available_ad_accounts, c.connected_at, c.disconnected_at, c.last_error, c.expires_at,
         greatest(
           (SELECT max(g.last_synced_at)  FROM crm.google_campaign g                  WHERE g.connection_id  = c.id),
           (SELECT max(gi.last_synced_at) FROM crm.google_campaign_insights_daily gi   WHERE gi.connection_id = c.id),
           (SELECT max(ms.last_synced_at) FROM crm.meta_campaign_snapshot ms           WHERE ms.connection_id = c.id),
           (SELECT max(mi.last_synced_at) FROM crm.meta_campaign_insights_daily mi     WHERE mi.connection_id = c.id),
           (SELECT max(ma.last_synced_at) FROM crm.meta_ad_snapshot ma                 WHERE ma.connection_id = c.id)
         ) AS last_synced_at
    FROM crm.ad_platform_connections c
    JOIN public.artists a ON a.id = c.artist_id
   WHERE c.artist_id = p_artist_id
     AND c.connection_scope = 'artist'
     AND (auth.uid() IS NULL
          OR public.user_has_company_access(a.company_id, ARRAY['admin','manager','marketing_manager']::public.app_role[]))
   ORDER BY c.platform;
$function$;

CREATE OR REPLACE FUNCTION public.artist_audience_set_manual(p_artist_id uuid, p_platform text, p_audience_type text, p_dimension text, p_snapshot_date date, p_rows jsonb, p_timeframe text DEFAULT 'manual'::text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_n integer := 0; v_bad text;
BEGIN
  IF p_platform NOT IN ('tiktok','instagram','youtube','spotify','deezer','apple-music','other') THEN RAISE EXCEPTION 'plataforma inválida: %', p_platform; END IF;
  IF p_audience_type NOT IN ('followers','engaged','reached','listeners') THEN RAISE EXCEPTION 'audience_type inválido: %', p_audience_type; END IF;
  IF p_dimension NOT IN ('age','gender','city','country') THEN RAISE EXCEPTION 'dimensão inválida: %', p_dimension; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'p_rows tem de ser um array não vazio'; END IF;
  SELECT COALESCE(r->>'unit','count') INTO v_bad
    FROM jsonb_array_elements(p_rows) AS r
   WHERE COALESCE(r->>'unit','count') NOT IN ('count','pct')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'unit inválida: % (aceita count ou pct)', v_bad; END IF;
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'artista não encontrado'; END IF;
  -- D-ERP168: papel na empresa do artista (não na empresa ativa).
  IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para registar demografia manual';
  END IF;
  INSERT INTO public.artist_audience_demographics (company_id, artist_id, platform, audience_type, dimension, dim_key, value, unit, timeframe, snapshot_date, source)
  SELECT v_company, p_artist_id, p_platform, p_audience_type, p_dimension, r->>'dim_key', (r->>'value')::numeric, COALESCE(r->>'unit','count'), p_timeframe, p_snapshot_date, 'manual'
  FROM jsonb_array_elements(p_rows) AS r
  WHERE COALESCE(r->>'dim_key','') <> '' AND (r->>'value') IS NOT NULL
  ON CONFLICT (artist_id, platform, audience_type, dimension, dim_key, snapshot_date)
  DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, timeframe = EXCLUDED.timeframe, source = 'manual';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.system_audit_log (company_id, entity_type, entity_id, action, changed_by, metadata)
  VALUES (v_company, 'artist_audience', p_artist_id::text, 'demographics_manual', COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object('platform', p_platform, 'audience_type', p_audience_type, 'dimension', p_dimension, 'snapshot_date', p_snapshot_date, 'linhas', v_n, 'note', p_note));
  RETURN v_n;
END; $function$;

CREATE OR REPLACE FUNCTION public.artist_song_playlist_streams_set(p_song_id uuid, p_snapshot_date date, p_period_days integer, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_artist uuid;
  v_count int := 0;
  v_changed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem sessao' USING ERRCODE = '42501';
  END IF;

  SELECT s.company_id, s.artist_id INTO v_company, v_artist
  FROM public.artist_songs s WHERE s.id = p_song_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'musica inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- D-ERP168: papel na empresa da música (não na empresa ativa).
  IF NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'papel sem permissao para gravar streams por playlist' USING ERRCODE = '42501';
  END IF;

  -- Valor novo ou diferente? (antes da gravação; regravações idênticas não marcam)
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r
      LEFT JOIN public.artist_song_playlist_streams t
        ON t.song_id = p_song_id
       AND t.snapshot_date = p_snapshot_date
       AND t.period_days = coalesce(p_period_days, 28)
       AND t.playlist_key = 'name:' || btrim(r->>'playlist_name')
    WHERE btrim(coalesce(r->>'playlist_name','')) <> ''
      AND (
        t.song_id IS NULL
        OR t.streams IS DISTINCT FROM NULLIF(r->>'streams','')::int
        OR t.rank IS DISTINCT FROM NULLIF(r->>'rank','')::int
        OR t.made_by IS DISTINCT FROM NULLIF(r->>'made_by','')
        OR t.date_added IS DISTINCT FROM NULLIF(r->>'date_added','')::date
      )
  ) INTO v_changed;

  WITH src AS (
    SELECT
      NULLIF(r->>'rank','')::int              AS rank,
      btrim(r->>'playlist_name')              AS playlist_name,
      NULLIF(r->>'made_by','')                AS made_by,
      NULLIF(r->>'streams','')::int           AS streams,
      NULLIF(r->>'date_added','')::date       AS date_added
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r
    WHERE btrim(coalesce(r->>'playlist_name','')) <> ''
  ), ins AS (
    INSERT INTO public.artist_song_playlist_streams
      (company_id, artist_id, song_id, snapshot_date, period_days,
       rank, playlist_name, made_by, streams, date_added, source)
    SELECT v_company, v_artist, p_song_id, p_snapshot_date,
           coalesce(p_period_days, 28),
           src.rank, src.playlist_name, src.made_by, src.streams,
           src.date_added, 's4a_manual'
    FROM src
    ON CONFLICT (song_id, snapshot_date, period_days, playlist_key) DO UPDATE
      SET rank = EXCLUDED.rank,
          made_by = EXCLUDED.made_by,
          streams = EXCLUDED.streams,
          date_added = EXCLUDED.date_added,
          artist_id = EXCLUDED.artist_id,
          source = EXCLUDED.source
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  IF v_changed THEN
    PERFORM public.artist_song_mark_report_stale(p_song_id);
  END IF;

  INSERT INTO public.system_audit_log
    (entity_type, entity_id, action, changed_by, new_data, company_id)
  VALUES (
    'artist_song_playlist_streams', p_song_id, 'set', v_uid::text,
    jsonb_build_object('snapshot_date', p_snapshot_date,
                       'period_days', coalesce(p_period_days, 28),
                       'rows', v_count),
    v_company
  );

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.artist_song_metric_set_manual(p_song_id uuid, p_platform text, p_metric text, p_metric_date date, p_value numeric, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_song record;
  v_old numeric;
  v_existe boolean;
BEGIN
  IF p_platform NOT IN ('tiktok','instagram','youtube','spotify','deezer','apple-music','other') THEN
    RAISE EXCEPTION 'plataforma inválida: %', p_platform;
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN RAISE EXCEPTION 'valor inválido'; END IF;
  SELECT id, artist_id, company_id INTO v_song FROM public.artist_songs WHERE id = p_song_id;
  IF v_song.id IS NULL THEN RAISE EXCEPTION 'música não encontrada'; END IF;
  -- D-ERP168: papel na empresa da música (não na empresa ativa).
  IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_song.company_id, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para registar métricas manuais';
  END IF;

  SELECT value INTO v_old FROM public.artist_song_metrics_daily
   WHERE song_id = p_song_id AND platform = p_platform AND metric = p_metric
     AND metric_date = p_metric_date AND source = 'manual';
  v_existe := FOUND;

  INSERT INTO public.artist_song_metrics_daily (company_id, song_id, artist_id, platform, metric, metric_date, value, source, source_ref, captured_at)
  VALUES (v_song.company_id, p_song_id, v_song.artist_id, p_platform, p_metric, p_metric_date, p_value, 'manual',
          COALESCE(p_note, 'registo manual'), now())
  ON CONFLICT (song_id, platform, metric, metric_date, source)
  DO UPDATE SET value = EXCLUDED.value, source_ref = EXCLUDED.source_ref, captured_at = now();

  -- Relatório desactualizado só em valor NOVO ou DIFERENTE (D-ERP54 adenda).
  IF (NOT v_existe) OR v_old IS DISTINCT FROM p_value THEN
    PERFORM public.artist_song_mark_report_stale(p_song_id);
  END IF;

  INSERT INTO public.system_audit_log (company_id, entity_type, entity_id, action, changed_by, metadata)
  VALUES (v_song.company_id, 'artist_song', p_song_id::text, 'metric_manual', COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object('platform', p_platform, 'metric', p_metric, 'date', p_metric_date, 'value', p_value, 'note', p_note));
END; $function$;

CREATE OR REPLACE FUNCTION public.artist_content_set_song(p_content_id uuid, p_song_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'confirmed'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old record;
  v_song_id uuid;
BEGIN
  IF p_status NOT IN ('none','estimated','confirmed','rejected') THEN
    RAISE EXCEPTION 'estado inválido: %', p_status;
  END IF;

  SELECT id, artist_id, company_id, song_id, song_link_status, song_link_reason
    INTO v_old
    FROM public.artist_content
   WHERE id = p_content_id;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'vídeo não encontrado';
  END IF;
  -- D-ERP168: papel na empresa do vídeo (não na empresa ativa).
  IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_old.company_id, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para alterar a ligação vídeo→música';
  END IF;

  IF p_status IN ('rejected','none') THEN
    v_song_id := NULL;
  ELSE
    v_song_id := COALESCE(p_song_id, v_old.song_id);
    IF v_song_id IS NULL THEN
      RAISE EXCEPTION 'estado % exige uma música', p_status;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.artist_songs s
       WHERE s.id = v_song_id AND s.artist_id = v_old.artist_id
    ) THEN
      RAISE EXCEPTION 'a música não pertence a este artista';
    END IF;
  END IF;

  UPDATE public.artist_content
     SET song_id = v_song_id,
         song_link_status = p_status,
         song_link_reason = CASE
           WHEN p_status = 'confirmed' THEN 'confirmado manualmente'
           WHEN p_status = 'rejected' THEN 'rejeitado manualmente'
           WHEN p_status = 'none' THEN NULL
           ELSE song_link_reason
         END,
         updated_at = now()
   WHERE id = p_content_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
  VALUES ('artist_content', p_content_id::text, 'set_song',
          COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object(
            'old_song_id', v_old.song_id,
            'old_status', v_old.song_link_status,
            'new_song_id', v_song_id,
            'new_status', p_status
          ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.artist_ads_link_song(p_platform text, p_campaign_id text, p_song_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  SELECT company_id INTO v_company FROM public.artist_songs WHERE id = p_song_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para ligar campanha a música' USING ERRCODE = '42501';
  END IF;
  -- D-ERP93: decisão humana fecha o trinco; o auto-link deixa de tocar nesta linha.
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign SET linked_song_id = p_song_id, linked_song_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  ELSE
    UPDATE crm.meta_campaign_snapshot SET linked_song_id = p_song_id, linked_song_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.artist_ads_unlink_song(p_platform text, p_campaign_id text, p_artist_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(p_artist_id);
  IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para desligar campanha de música' USING ERRCODE = '42501';
  END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign gc
      SET linked_song_id = NULL, linked_song_locked = true
    WHERE gc.external_campaign_id = p_campaign_id
      AND EXISTS (
        SELECT 1 FROM crm.ad_platform_connections c
        WHERE c.id = gc.connection_id AND c.connection_scope = 'artist'
          AND c.artist_id = p_artist_id AND c.company_id = v_company
      );
  ELSE
    UPDATE crm.meta_campaign_snapshot ms
      SET linked_song_id = NULL, linked_song_locked = true
    WHERE ms.external_campaign_id = p_campaign_id
      AND EXISTS (
        SELECT 1 FROM crm.ad_platform_connections c
        WHERE c.id = ms.connection_id AND c.connection_scope = 'artist'
          AND c.artist_id = p_artist_id AND c.company_id = v_company
      );
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.artist_ads_connections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_connections(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_audience_set_manual(uuid,text,text,text,date,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_audience_set_manual(uuid,text,text,text,date,jsonb,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_song_playlist_streams_set(uuid,date,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_playlist_streams_set(uuid,date,integer,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_song_metric_set_manual(uuid,text,text,date,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_metric_set_manual(uuid,text,text,date,numeric,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_content_set_song(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_content_set_song(uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_ads_link_song(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_link_song(text,text,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_ads_unlink_song(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlink_song(text,text,uuid) TO authenticated, service_role;

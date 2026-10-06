CREATE OR REPLACE FUNCTION public.artist_ads_sync_status(p_artist_id uuid)
 RETURNS TABLE(platform text, escopo text, last_sync_at timestamp with time zone, cadencia text, cadencia_minutos integer, atrasado boolean, last_error text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
-- D-ERP155: só plataformas com ligação de anúncios do artista; horas por ligação.
-- D-ERP178: TikTok passa a uma linha POR LIGAÇÃO (sync por API; manual como fallback).
DECLARE
  v_meta_ids uuid[]; v_google_ids uuid[];
  v_meta timestamptz; v_meta_err text; v_google timestamptz; v_rec timestamptz;
  t record; v_api timestamptz; v_api_err text; v_man timestamptz;
BEGIN
  PERFORM public.artist_ads_assert_access(p_artist_id);

  SELECT array_agg(c.id) FILTER (WHERE c.platform = 'meta' AND c.status = 'active'),
         array_agg(c.id) FILTER (WHERE c.platform = 'google' AND c.status = 'active')
    INTO v_meta_ids, v_google_ids
    FROM crm.ad_platform_connections c
   WHERE c.artist_id = p_artist_id AND c.connection_scope = 'artist';

  IF v_meta_ids IS NOT NULL THEN
    SELECT max(s.last_sync_at) INTO v_meta FROM crm.meta_sync_state s WHERE s.connection_id = ANY(v_meta_ids);
    SELECT s.last_error INTO v_meta_err FROM crm.meta_sync_state s
     WHERE s.connection_id = ANY(v_meta_ids) AND s.last_error IS NOT NULL
     ORDER BY s.last_error_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_google_ids IS NOT NULL THEN
    SELECT greatest(
      (SELECT max(gc.last_synced_at) FROM crm.google_campaign gc WHERE gc.connection_id = ANY(v_google_ids)),
      (SELECT max(r.finished_at) FROM public.sync_runs r
        WHERE r.function_name IN ('crm-google-sync-campaigns','crm-google-video-metrics-sync')
          AND NOT r.dry_run AND r.status IN ('success','partial')
          AND EXISTS (SELECT 1 FROM unnest(v_google_ids) g WHERE r.details->'per_connection' ? g::text))
    ) INTO v_google;
  END IF;

  IF v_meta_ids IS NOT NULL OR v_google_ids IS NOT NULL THEN
    SELECT max(r.finished_at) INTO v_rec FROM public.sync_runs r
     WHERE r.function_name IN ('crm-meta-sync-insights:breakdowns','crm-google-sync-campaigns:breakdowns')
       AND NOT r.dry_run
       AND EXISTS (SELECT 1 FROM unnest(coalesce(v_meta_ids,'{}') || coalesce(v_google_ids,'{}')) x
                    WHERE r.details->'per_connection' ? x::text OR r.details->'params'->>'connection_id' = x::text);
  END IF;

  IF v_meta_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'meta'::text, 'campanhas e resultados'::text, v_meta, 'de hora a hora'::text, 60,
      (v_meta IS NULL OR v_meta < now() - interval '120 minutes'), v_meta_err;
  END IF;
  IF v_google_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'google'::text, 'campanhas e vídeo'::text, v_google, 'de 3 em 3 horas'::text, 180,
      (v_google IS NULL OR v_google < now() - interval '360 minutes'), NULL::text;
  END IF;
  IF v_meta_ids IS NOT NULL OR v_google_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'recortes'::text, 'região, idade e género'::text, v_rec, '1x por dia'::text, 1440,
      (v_rec IS NULL OR v_rec < now() - interval '2880 minutes'), NULL::text;
  END IF;

  FOR t IN SELECT c.id, c.status, c.selected_ad_account_currency AS cur, c.selected_ad_account_id AS acc
             FROM crm.ad_platform_connections c
            WHERE c.artist_id = p_artist_id AND c.connection_scope = 'artist' AND c.platform = 'tiktok'
              AND c.status IN ('active','pending_link','error')
            ORDER BY c.created_at LOOP
    v_api := NULL; v_api_err := NULL; v_man := NULL;
    SELECT max(r.finished_at) INTO v_api FROM public.sync_runs r
     WHERE r.function_name = 'artist-ads-tiktok-sync' AND NOT r.dry_run
       AND (r.details->'per_connection'->t.id::text->>'ok')::boolean IS TRUE;
    SELECT r.details->'per_connection'->t.id::text->>'error' INTO v_api_err FROM public.sync_runs r
     WHERE r.function_name = 'artist-ads-tiktok-sync' AND NOT r.dry_run AND r.details->'per_connection' ? t.id::text
     ORDER BY r.started_at DESC LIMIT 1;
    IF v_api IS NOT NULL OR v_api_err IS NOT NULL THEN
      RETURN QUERY SELECT 'tiktok'::text, ('campanhas e resultados (' || coalesce(t.cur,'?') || ')')::text, v_api,
        '3x por dia'::text, 360, (v_api IS NULL OR v_api < now() - interval '720 minutes'), v_api_err;
    ELSE
      SELECT max(i.recorded_at) INTO v_man FROM crm.tiktok_insights_daily i WHERE i.connection_id = t.id AND i.source = 'manual';
      IF v_man IS NOT NULL THEN
        RETURN QUERY SELECT 'tiktok'::text, ('registo manual (' || coalesce(t.cur,'?') || ')')::text, v_man, 'manual'::text, NULL::integer, false, NULL::text;
      END IF;
    END IF;
  END LOOP;
END; $function$;
CREATE OR REPLACE FUNCTION public.artist_ads_alerts_run()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $function$
DECLARE v_run uuid; v_t0 timestamptz := clock_timestamp(); v_new int := 0; v_res int := 0; v_n int; r record;
BEGIN
  INSERT INTO public.sync_runs (function_name, trigger_source, dry_run, status)
  VALUES ('artist-ads-alerts', 'cron', false, 'running') RETURNING id INTO v_run;
  BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _alerts_now (artist_id uuid, company_id uuid, connection_id uuid, platform text,
      kind text, severity text, message text, campaign_id text, day date) ON COMMIT DROP;
    DELETE FROM _alerts_now WHERE true;
    FOR r IN SELECT DISTINCT c.artist_id, c.company_id FROM crm.ad_platform_connections c
             WHERE c.connection_scope='artist' AND c.platform='tiktok' AND c.status='active' AND c.artist_id IS NOT NULL LOOP
      INSERT INTO _alerts_now SELECT r.artist_id, r.company_id, t.* FROM crm.artist_ads_tiktok_alerts_core(r.artist_id) t;
    END LOOP;
    INSERT INTO public.artist_ads_alert_log (company_id, artist_id, connection_id, platform, kind, severity, message, campaign_id, day)
    SELECT company_id, artist_id, connection_id, platform, kind, severity, message, campaign_id, day FROM _alerts_now
    ON CONFLICT ON CONSTRAINT artist_ads_alert_log_dedupe DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    UPDATE public.artist_ads_alert_log l SET resolved_at = now()
    WHERE l.resolved_at IS NULL AND l.platform = 'tiktok'
      AND NOT EXISTS (SELECT 1 FROM _alerts_now a WHERE a.connection_id = l.connection_id AND a.kind = l.kind
        AND a.campaign_id IS NOT DISTINCT FROM l.campaign_id);
    GET DIAGNOSTICS v_res = ROW_COUNT;
    SELECT count(*) INTO v_n FROM _alerts_now;
    UPDATE public.sync_runs SET status = CASE WHEN v_new > 0 THEN 'success' ELSE 'no_data' END,
      finished_at = now(), duration_ms = (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int,
      rows_written = v_new, details = jsonb_build_object('a_disparar', v_n, 'novas', v_new, 'resolvidas', v_res)
    WHERE id = v_run;
    RETURN jsonb_build_object('a_disparar', v_n, 'novas', v_new, 'resolvidas', v_res);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.sync_runs SET status = 'error', finished_at = now(), error_text = left(SQLERRM, 1000) WHERE id = v_run;
    RETURN jsonb_build_object('erro', SQLERRM);
  END;
END $function$;
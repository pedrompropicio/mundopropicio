-- D-ERP267 — Alertas de saldo e de entrega parada nas contas de anúncios dos artistas (autorizado 13/10/2026).
CREATE TABLE IF NOT EXISTS crm.artist_ads_balance_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL,
  platform text NOT NULL,
  account_id text,
  currency text,
  balance numeric,
  balance_source text NOT NULL,
  avg_spend_3d numeric,
  days_left numeric,
  read_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);
CREATE INDEX IF NOT EXISTS artist_ads_balance_readings_conn_idx ON crm.artist_ads_balance_readings (connection_id, read_at DESC);
CREATE INDEX IF NOT EXISTS artist_ads_balance_readings_artist_idx ON crm.artist_ads_balance_readings (artist_id, read_at DESC);
GRANT SELECT ON crm.artist_ads_balance_readings TO authenticated;
GRANT ALL ON crm.artist_ads_balance_readings TO service_role;
ALTER TABLE crm.artist_ads_balance_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY artist_ads_balance_readings_select ON crm.artist_ads_balance_readings
  FOR SELECT TO authenticated USING (public.artist_access_ok(artist_id, 'read', 'traffic'));
CREATE POLICY artist_ads_balance_readings_service ON crm.artist_ads_balance_readings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.artist_ads_alert_log ADD COLUMN IF NOT EXISTS days_left numeric;
ALTER TABLE public.artist_ads_alert_log ADD COLUMN IF NOT EXISTS resolved_notified_at timestamptz;

-- dedupe antigo era por dia; passa a "um aberto por (ligação, kind, campanha) até resolver"
ALTER TABLE public.artist_ads_alert_log DROP CONSTRAINT IF EXISTS artist_ads_alert_log_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS artist_ads_alert_log_open_uniq
  ON public.artist_ads_alert_log (connection_id, kind, campaign_id) NULLS NOT DISTINCT
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.artist_ads_alerts_run()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
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
    ON CONFLICT (connection_id, kind, campaign_id) WHERE resolved_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    UPDATE public.artist_ads_alert_log l SET resolved_at = now()
    WHERE l.resolved_at IS NULL AND l.platform = 'tiktok'
      AND l.kind NOT IN ('saldo_baixo','saldo_critico','saldo_ilegivel','entrega_parada')
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

CREATE OR REPLACE FUNCTION crm.artist_ads_alert_notify(p_alert_id uuid, p_event text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  a record; v_artist text; v_subject text; v_text text; v_msg_id text; v_ch text;
  v_channels text[] := ARRAY['email'];   -- 2.º canal (ex.: 'whatsapp') acrescenta-se aqui
  v_to constant text := 'pedroneto@mundopropicio.com';
BEGIN
  SELECT l.*, c.selected_ad_account_id AS acc INTO a
  FROM public.artist_ads_alert_log l JOIN crm.ad_platform_connections c ON c.id = l.connection_id
  WHERE l.id = p_alert_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT name INTO v_artist FROM public.artists WHERE id = a.artist_id;
  v_subject := '[ALERTA ADS] ' || coalesce(v_artist,'Artista') || ' · ' || initcap(a.platform) || ' ' || coalesce(a.acc,'?') || ' · ' || a.kind
               || CASE WHEN p_event = 'resolved' THEN ' · resolvido' ELSE '' END;
  v_text := CASE WHEN p_event = 'resolved'
    THEN 'Resolvido: ' || a.message || E'\nDetectado: ' || to_char(a.detected_at AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI')
         || E'\nResolvido: ' || to_char(coalesce(a.resolved_at, now()) AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI') || ' (Fortaleza)'
    ELSE a.message || E'\nGravidade: ' || a.severity || E'\nDetectado: '
         || to_char(a.detected_at AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI') || ' (Fortaleza)' END
    || E'\n\n— MP Gestão Eventos';
  v_msg_id := 'ads-alert-' || p_alert_id::text || '-' || p_event;
  FOREACH v_ch IN ARRAY v_channels LOOP
    IF v_ch = 'email' THEN
      PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
        'message_id', v_msg_id, 'to', v_to,
        'from', 'MP Gestão Eventos <noreply@mpgestaoeventos.com>',
        'sender_domain', 'notify.mpgestaoeventos.com',
        'subject', v_subject, 'text', v_text,
        'html', '<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;white-space:pre-wrap">' ||
                replace(replace(v_text,'&','&amp;'),'<','&lt;') || '</pre>',
        'purpose', 'transactional', 'label', 'artist_ads_alert',
        'idempotency_key', v_msg_id,
        'queued_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), a.company_id);
    END IF;
  END LOOP;
  IF p_event = 'resolved' THEN
    UPDATE public.artist_ads_alert_log SET resolved_notified_at = now() WHERE id = p_alert_id;
  ELSE
    UPDATE public.artist_ads_alert_log SET notified_at = now() WHERE id = p_alert_id;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION crm.artist_ads_alert_notify(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.artist_ads_alert_notify(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_balance_alerts_apply(p_scope text, p_connections uuid[], p_alerts jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_kinds text[]; v_new uuid[] := '{}'; v_res uuid[] := '{}'; v_id uuid; v_ins boolean; r record;
BEGIN
  v_kinds := CASE p_scope WHEN 'balance' THEN ARRAY['saldo_baixo','saldo_critico','saldo_ilegivel']
                          WHEN 'delivery' THEN ARRAY['entrega_parada'] ELSE NULL END;
  IF v_kinds IS NULL THEN RAISE EXCEPTION 'scope inválido: %', p_scope; END IF;
  FOR r IN SELECT (x->>'connection_id')::uuid AS cid, x->>'kind' AS kind, x->>'severity' AS sev,
                  x->>'message' AS msg, nullif(x->>'days_left','')::numeric AS dl
           FROM jsonb_array_elements(coalesce(p_alerts,'[]'::jsonb)) x
           WHERE x->>'kind' = ANY(v_kinds) AND (x->>'connection_id')::uuid = ANY(p_connections) LOOP
    v_id := NULL; v_ins := NULL;
    INSERT INTO public.artist_ads_alert_log (company_id, artist_id, connection_id, platform, kind, severity, message, day, days_left)
    SELECT c.company_id, c.artist_id, c.id, c.platform, r.kind, r.sev, r.msg,
           (now() AT TIME ZONE 'America/Fortaleza')::date, r.dl
    FROM crm.ad_platform_connections c WHERE c.id = r.cid AND c.artist_id IS NOT NULL
    ON CONFLICT (connection_id, kind, campaign_id) WHERE resolved_at IS NULL
      DO UPDATE SET days_left = EXCLUDED.days_left
    RETURNING id, (xmax = 0) INTO v_id, v_ins;
    IF v_ins THEN v_new := v_new || v_id; END IF;
  END LOOP;
  FOR r IN SELECT l.id FROM public.artist_ads_alert_log l
           WHERE l.resolved_at IS NULL AND l.kind = ANY(v_kinds) AND l.connection_id = ANY(p_connections)
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_alerts,'[]'::jsonb)) x
                             WHERE (x->>'connection_id')::uuid = l.connection_id AND x->>'kind' = l.kind) LOOP
    UPDATE public.artist_ads_alert_log SET resolved_at = now() WHERE id = r.id;
    v_res := v_res || r.id;
  END LOOP;
  FOREACH v_id IN ARRAY v_new LOOP PERFORM crm.artist_ads_alert_notify(v_id, 'opened'); END LOOP;
  FOREACH v_id IN ARRAY v_res LOOP PERFORM crm.artist_ads_alert_notify(v_id, 'resolved'); END LOOP;
  RETURN jsonb_build_object('novos', to_jsonb(v_new), 'resolvidos', to_jsonb(v_res));
END $function$;
REVOKE ALL ON FUNCTION public.artist_ads_balance_alerts_apply(text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_balance_alerts_apply(text, uuid[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_open_alerts(p_artist_id uuid)
 RETURNS TABLE(kind text, severity text, platform text, account_id text, message text, detected_at timestamptz, days_left numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
BEGIN
  PERFORM public.artist_access_check(p_artist_id, 'read', 'traffic');
  RETURN QUERY
  SELECT l.kind, l.severity, l.platform, c.selected_ad_account_id, l.message, l.detected_at, l.days_left
  FROM public.artist_ads_alert_log l
  JOIN crm.ad_platform_connections c ON c.id = l.connection_id
  WHERE l.artist_id = p_artist_id AND l.resolved_at IS NULL
  ORDER BY CASE l.severity WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, l.detected_at DESC;
END $function$;
REVOKE ALL ON FUNCTION public.artist_ads_open_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_open_alerts(uuid) TO authenticated, service_role;
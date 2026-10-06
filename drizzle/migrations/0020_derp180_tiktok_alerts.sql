-- D-ERP180: alertas TikTok + registo persistente.
ALTER TABLE crm.artist_ads_budget_caps
  ADD COLUMN IF NOT EXISTS alert_daily_floor numeric,
  ADD COLUMN IF NOT EXISTS alert_floor_after_local time,
  ADD COLUMN IF NOT EXISTS alert_floor_tz text;
COMMENT ON COLUMN crm.artist_ads_budget_caps.alert_daily_floor IS 'D-ERP180: piso diário de gasto (moeda da conta) para o alerta gasto_dia_abaixo; null = sem alerta';
COMMENT ON COLUMN crm.artist_ads_budget_caps.alert_floor_after_local IS 'D-ERP180: só alerta depois desta hora local (alert_floor_tz)';

CREATE TABLE IF NOT EXISTS public.artist_ads_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  campaign_id text,
  day date NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT artist_ads_alert_log_dedupe UNIQUE NULLS NOT DISTINCT (connection_id, kind, campaign_id, day)
);
GRANT SELECT ON public.artist_ads_alert_log TO authenticated;
GRANT ALL ON public.artist_ads_alert_log TO service_role;
ALTER TABLE public.artist_ads_alert_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS artist_ads_alert_log_select ON public.artist_ads_alert_log;
CREATE POLICY artist_ads_alert_log_select ON public.artist_ads_alert_log
  FOR SELECT TO authenticated USING (public.user_has_company_access(company_id));
CREATE INDEX IF NOT EXISTS artist_ads_alert_log_artist_idx ON public.artist_ads_alert_log (artist_id, day DESC);

CREATE OR REPLACE FUNCTION crm.artist_ads_tiktok_alerts_core(p_artist_id uuid)
RETURNS TABLE(connection_id uuid, platform text, kind text, severity text, message text, campaign_id text, day date)
LANGUAGE sql STABLE SET search_path TO 'public','crm' AS $f$
  WITH conns AS (
    SELECT c.id, upper(coalesce(c.selected_ad_account_currency,'')) AS ccy,
      coalesce(c.oauth_meta->>'account_timezone','UTC') AS tz
    FROM crm.ad_platform_connections c
    WHERE c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.platform='tiktok' AND c.status='active'
  ),
  d AS (SELECT c.*, (now() AT TIME ZONE c.tz)::date AS today FROM conns c),
  ads AS (
    SELECT g.connection_id AS conn, g.external_campaign_id AS cid, tc.name AS cname, upper(coalesce(tc.status,'')) AS cst,
      upper(coalesce(g.status,'')) AS gst,
      a->>'name' AS aname, upper(coalesce(a->>'operation_status','')) AS aop, upper(coalesce(a->>'secondary_status','')) AS asec
    FROM crm.tiktok_adgroup g
    JOIN conns c ON c.id = g.connection_id
    JOIN crm.tiktok_campaign tc ON tc.connection_id = g.connection_id AND tc.external_campaign_id = g.external_campaign_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(g.raw->'ads','[]'::jsonb)) a
    WHERE upper(coalesce(tc.status,'')) NOT IN ('REMOVED','DELETE','DELETED')
  ),
  gday AS (
    SELECT i.connection_id AS conn, i.external_campaign_id AS cid, i.date_start AS dd,
      coalesce(i.spend_cents,0)/100.0 AS spend, coalesce(i.video_views_6s,0) AS v6, g.name AS gname
    FROM crm.tiktok_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    LEFT JOIN crm.tiktok_adgroup g ON g.connection_id = i.connection_id AND g.external_adgroup_id = i.external_id
    WHERE i.level = 'adgroup' AND i.date_start >= current_date - 5
  ),
  r1 AS (
    SELECT a.conn, 'anuncio_rejeitado'::text AS kind, 'alta'::text AS sev,
      count(*)||' anúncio(s) rejeitado(s)/não aprovado(s) na campanha '||a.cname||': '||string_agg(left(a.aname,60), '; ') AS msg,
      a.cid, d.today AS dd
    FROM ads a JOIN d ON d.id = a.conn
    WHERE a.asec ~ '(REJECT|NOT_PASS|AUDIT_DENY|UNAPPROVED|NOT_APPROVED)'
    GROUP BY a.conn, a.cid, a.cname, d.today
  ),
  r2 AS (
    SELECT a.conn, 'anuncio_parado'::text AS kind, 'media'::text AS sev,
      count(*)||' anúncio(s) parado(s) em grupo activo na campanha '||a.cname||': '||string_agg(left(a.aname,60), '; ') AS msg,
      a.cid, d.today AS dd
    FROM ads a JOIN d ON d.id = a.conn
    WHERE a.cst IN ('ENABLE','ACTIVE') AND a.gst IN ('ENABLE','ACTIVE')
      AND (a.aop = 'DISABLE' OR (a.asec LIKE '%DISABLE%' AND a.asec NOT LIKE '%ADGROUP_DISABLE%' AND a.asec NOT LIKE '%CAMPAIGN_DISABLE%'))
      AND a.asec !~ '(REJECT|NOT_PASS|AUDIT_DENY|UNAPPROVED|NOT_APPROVED)'
    GROUP BY a.conn, a.cid, a.cname, d.today
  ),
  st AS (
    SELECT d.id AS conn, d.today, d.ccy, coalesce(sum(g.spend),0) AS spend
    FROM d LEFT JOIN gday g ON g.conn = d.id AND g.dd = d.today
    GROUP BY d.id, d.today, d.ccy
  ),
  r3 AS (
    SELECT s.conn, 'gasto_dia_acima'::text AS kind, 'alta'::text AS sev,
      'Gasto de hoje '||to_char(s.spend,'FM999990D00')||' '||s.ccy||' acima do teto diário '||to_char(b.daily_cap,'FM999990D00')||' '||s.ccy||'.' AS msg,
      NULL::text AS cid, s.today AS dd
    FROM st s JOIN crm.artist_ads_budget_caps b ON b.connection_id = s.conn
    WHERE s.spend > b.daily_cap
  ),
  r4 AS (
    SELECT s.conn, 'gasto_dia_abaixo'::text AS kind, 'media'::text AS sev,
      'Gasto de hoje '||to_char(s.spend,'FM999990D00')||' '||s.ccy||' abaixo do piso '||to_char(b.alert_daily_floor,'FM999990D00')||' '||s.ccy||
        ' depois das '||to_char(coalesce(b.alert_floor_after_local,'00:00'::time),'HH24:MI')||' ('||coalesce(b.alert_floor_tz,'Europe/Lisbon')||').' AS msg,
      NULL::text AS cid, s.today AS dd
    FROM st s JOIN crm.artist_ads_budget_caps b ON b.connection_id = s.conn
    WHERE b.alert_daily_floor IS NOT NULL
      AND (now() AT TIME ZONE coalesce(b.alert_floor_tz,'Europe/Lisbon'))::time >= coalesce(b.alert_floor_after_local,'00:00'::time)
      AND s.spend < b.alert_daily_floor
  ),
  cpv AS (
    SELECT g.conn, g.cid, g.dd, g.gname, g.spend / g.v6 AS cpv
    FROM gday g
    JOIN d ON d.id = g.conn
    JOIN crm.tiktok_campaign tc ON tc.connection_id = g.conn AND tc.external_campaign_id = g.cid
    WHERE upper(coalesce(tc.objective,'')) LIKE '%VIEW%' AND g.v6 > 0
      AND g.spend >= CASE d.ccy WHEN 'EUR' THEN 5 ELSE 30 END
      AND upper(left(regexp_replace(coalesce(g.gname,''), '^(\s*\[[^\]]*\]\s*)+', ''),1)) <> 'R'
  ),
  cday AS (
    SELECT conn, cid, dd, max(cpv) AS mx, min(cpv) AS mn,
      (array_agg(gname ORDER BY cpv DESC))[1] AS caro, (array_agg(gname ORDER BY cpv ASC))[1] AS barato
    FROM cpv GROUP BY 1,2,3 HAVING count(*) >= 2
  ),
  r5 AS (
    SELECT a.conn, 'custo_view_desequilibrado'::text AS kind, 'media'::text AS sev,
      'Custo por view 6 s desequilibrado 2 dias seguidos ('||to_char(b.dd,'DD/MM')||' e '||to_char(a.dd,'DD/MM')||'): '
        ||a.caro||' '||round((a.mx/a.mn - 1)*100)||'% acima de '||a.barato||'.' AS msg,
      a.cid, a.dd
    FROM cday a JOIN cday b ON b.conn = a.conn AND b.cid = a.cid AND b.dd = a.dd - 1
    JOIN d ON d.id = a.conn
    WHERE a.mx >= 1.5 * a.mn AND b.mx >= 1.5 * b.mn AND a.dd >= d.today - 1
  ),
  allr AS (
    SELECT * FROM r1 UNION ALL SELECT * FROM r2 UNION ALL SELECT * FROM r3
    UNION ALL SELECT * FROM r4 UNION ALL SELECT * FROM r5
  )
  SELECT conn, 'tiktok'::text, kind, sev, msg, cid, dd FROM allr
$f$;

CREATE OR REPLACE FUNCTION public.artist_ads_alerts(p_artist_id uuid)
 RETURNS TABLE(platform text, kind text, severity text, message text, campaign_id text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  camp AS (SELECT * FROM public.artist_ads_campaigns(p_artist_id, false)),
  ins7 AS (
    SELECT 'google'::text AS platform, i.external_campaign_id AS campaign_id,
           sum(i.impressions) AS impressions_7d
    FROM crm.google_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='google')
      AND i.date_start >= current_date - 6
    GROUP BY 1,2
    UNION ALL
    SELECT 'meta', i.external_campaign_id, sum(i.impressions)
    FROM crm.meta_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='meta')
      AND i.date_start >= current_date - 6
    GROUP BY 1,2
  )
  SELECT c.platform, 'conta_sem_entrega'::text, 'alta'::text,
    'Campanha activa sem entrega nos últimos 7 dias: '||coalesce(c.campaign_name,c.campaign_id),
    c.campaign_id
  FROM camp c
  LEFT JOIN ins7 i ON i.platform = c.platform AND i.campaign_id = c.campaign_id
  WHERE upper(coalesce(c.status,'')) IN ('ENABLED','ACTIVE')
    AND coalesce(i.impressions_7d,0) = 0
    AND c.start_date IS NOT NULL AND c.start_date <= current_date - 2
  UNION ALL
  SELECT c.platform, 'token_a_expirar', 'alta',
    'A autorização da conta de anúncios expira a '||to_char(c.expires_at,'DD/MM/YYYY')||'.', NULL
  FROM conns c WHERE c.expires_at IS NOT NULL AND c.expires_at < now() + interval '7 days'
  UNION ALL
  SELECT c.platform, 'ligacao_com_erro', 'alta',
    'Ligação com problema ('||coalesce(c.status,'?')||')'||coalesce(': '||c.last_error,'')||'.', NULL
  FROM conns c
  WHERE coalesce(c.status,'') IN ('error','expired','revoked') OR c.last_error IS NOT NULL
  UNION ALL
  SELECT 'meta', 'pagamento_pendente', 'alta',
    'A conta de anúncios '||coalesce(a->>'name', c.selected_ad_account_id)||
    ' está com pagamento pendente ou desactivada (estado '||(a->>'account_status')||').', NULL
  FROM conns c
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.available_ad_accounts,'[]'::jsonb)) a
  WHERE c.platform='meta' AND a->>'id' = c.selected_ad_account_id
    AND (a->>'account_status') IN ('2','3')
  UNION ALL
  SELECT t.platform, t.kind, t.severity, t.message, t.campaign_id
  FROM guard, crm.artist_ads_tiktok_alerts_core(p_artist_id) t
$function$;

CREATE OR REPLACE FUNCTION public.artist_ads_alerts_run()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $function$
DECLARE v_run uuid; v_t0 timestamptz := clock_timestamp(); v_new int := 0; v_res int := 0; v_n int; r record;
BEGIN
  INSERT INTO public.sync_runs (function_name, trigger_source, dry_run, status)
  VALUES ('artist-ads-alerts', 'cron', false, 'running') RETURNING id INTO v_run;
  BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _alerts_now (artist_id uuid, company_id uuid, connection_id uuid, platform text,
      kind text, severity text, message text, campaign_id text, day date) ON COMMIT DROP;
    DELETE FROM _alerts_now;
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
REVOKE ALL ON FUNCTION public.artist_ads_alerts_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_alerts_run() TO service_role;
REVOKE ALL ON FUNCTION crm.artist_ads_tiktok_alerts_core(uuid) FROM PUBLIC, anon, authenticated;
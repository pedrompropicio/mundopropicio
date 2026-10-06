-- D-ERP181 — País de mercado por campanha.
ALTER TABLE crm.tiktok_campaign ADD COLUMN IF NOT EXISTS market_country text, ADD COLUMN IF NOT EXISTS market_country_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.google_campaign ADD COLUMN IF NOT EXISTS market_country text, ADD COLUMN IF NOT EXISTS market_country_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.meta_campaign_snapshot ADD COLUMN IF NOT EXISTS market_country text, ADD COLUMN IF NOT EXISTS market_country_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.tiktok_adgroup ADD COLUMN IF NOT EXISTS market_country text;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tiktok_campaign','google_campaign','meta_campaign_snapshot','tiktok_adgroup'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_market_country_chk') THEN
      EXECUTE format('ALTER TABLE crm.%I ADD CONSTRAINT %I CHECK (market_country IS NULL OR market_country ~ ''^([A-Z]{2}|MULTI)$'')', t, t||'_market_country_chk');
    END IF;
  END LOOP;
END $$;

-- Mapa de ids de geo das plataformas (ex.: TikTok location_ids = GeoNames) → ISO-2.
CREATE TABLE IF NOT EXISTS crm.ads_geo_country_map (
  platform text NOT NULL, geo_id text NOT NULL, country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  nome text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, geo_id)
);
GRANT ALL ON crm.ads_geo_country_map TO service_role;
ALTER TABLE crm.ads_geo_country_map ENABLE ROW LEVEL SECURITY;

-- Benchmark por país (sem valores por agora).
CREATE TABLE IF NOT EXISTS public.artist_ads_country_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  metric text NOT NULL,
  value numeric,
  currency text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, metric)
);
GRANT SELECT ON public.artist_ads_country_benchmarks TO authenticated;
GRANT ALL ON public.artist_ads_country_benchmarks TO service_role;
ALTER TABLE public.artist_ads_country_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS benchmarks_read ON public.artist_ads_country_benchmarks;
CREATE POLICY benchmarks_read ON public.artist_ads_country_benchmarks FOR SELECT TO authenticated USING (true);

-- Preenchimento automático Meta + TikTok a partir dos dados gravados pelos syncs.
CREATE OR REPLACE FUNCTION public.ads_market_country_refresh(p_connection_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $f$
DECLARE v_meta int := 0; v_tg int := 0; v_tc int := 0; v_unmapped jsonb;
BEGIN
  WITH a AS (
    SELECT s.connection_id, s.external_campaign_id cid, upper(x) iso
    FROM crm.meta_adset_snapshot s
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.targeting->'geo_locations'->'countries')='array'
                                            THEN s.targeting->'geo_locations'->'countries' ELSE '[]' END)
      UNION SELECT v #>> '{}' FROM jsonb_path_query(coalesce(s.targeting->'geo_locations','{}'), 'lax $.*[*].country') v
    ) z(x)
    WHERE (p_connection_id IS NULL OR s.connection_id = p_connection_id) AND x ~* '^[a-z]{2}$'
  ), r AS (
    SELECT connection_id, cid, CASE WHEN count(DISTINCT iso)=1 THEN min(iso) ELSE 'MULTI' END mc FROM a GROUP BY 1,2
  )
  UPDATE crm.meta_campaign_snapshot m SET market_country = r.mc
  FROM r WHERE m.connection_id = r.connection_id AND m.external_campaign_id = r.cid
    AND NOT m.market_country_locked AND m.market_country IS DISTINCT FROM r.mc;
  GET DIAGNOSTICS v_meta = ROW_COUNT;

  WITH g AS (
    SELECT ag.id, upper(mp.country) iso
    FROM crm.tiktok_adgroup ag
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(ag.raw->'location_ids')='array' THEN ag.raw->'location_ids' ELSE '[]' END) l(gid)
    JOIN crm.ads_geo_country_map mp ON mp.platform='tiktok' AND mp.geo_id = l.gid
    WHERE p_connection_id IS NULL OR ag.connection_id = p_connection_id
  ), r AS (SELECT id, CASE WHEN count(DISTINCT iso)=1 THEN min(iso) ELSE 'MULTI' END mc FROM g GROUP BY 1)
  UPDATE crm.tiktok_adgroup ag SET market_country = r.mc FROM r
  WHERE ag.id = r.id AND ag.market_country IS DISTINCT FROM r.mc;
  GET DIAGNOSTICS v_tg = ROW_COUNT;

  WITH r AS (
    SELECT ag.connection_id, ag.external_campaign_id cid,
      CASE WHEN count(DISTINCT ag.market_country)=1 AND bool_and(ag.market_country<>'MULTI') THEN min(ag.market_country) ELSE 'MULTI' END mc
    FROM crm.tiktok_adgroup ag
    WHERE ag.market_country IS NOT NULL AND (p_connection_id IS NULL OR ag.connection_id = p_connection_id)
    GROUP BY 1,2
  )
  UPDATE crm.tiktok_campaign t SET market_country = r.mc FROM r
  WHERE t.connection_id = r.connection_id AND t.external_campaign_id = r.cid
    AND NOT t.market_country_locked AND t.market_country IS DISTINCT FROM r.mc;
  GET DIAGNOSTICS v_tc = ROW_COUNT;

  SELECT coalesce(jsonb_agg(DISTINCT l.gid),'[]') INTO v_unmapped
  FROM crm.tiktok_adgroup ag
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(ag.raw->'location_ids')='array' THEN ag.raw->'location_ids' ELSE '[]' END) l(gid)
  WHERE (p_connection_id IS NULL OR ag.connection_id = p_connection_id)
    AND NOT EXISTS (SELECT 1 FROM crm.ads_geo_country_map mp WHERE mp.platform='tiktok' AND mp.geo_id=l.gid);

  RETURN jsonb_build_object('meta_campanhas', v_meta, 'tiktok_grupos', v_tg, 'tiktok_campanhas', v_tc, 'tiktok_location_ids_sem_mapa', v_unmapped);
END $f$;
REVOKE ALL ON FUNCTION public.ads_market_country_refresh(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ads_market_country_refresh(uuid) TO service_role;

-- Google: o sync manda {campaign_id: [ISO,...]} lido de campaign_criterion (LOCATION).
CREATE OR REPLACE FUNCTION public.ads_market_country_apply_google(p_connection_id uuid, p_map jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $f$
DECLARE v_n int := 0;
BEGIN
  WITH r AS (
    SELECT e.key cid, CASE WHEN count(DISTINCT upper(x))=1 THEN min(upper(x)) ELSE 'MULTI' END mc
    FROM jsonb_each(coalesce(p_map,'{}')) e
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.value)='array' THEN e.value ELSE '[]' END) x
    WHERE x ~* '^[a-z]{2}$' GROUP BY 1
  )
  UPDATE crm.google_campaign g SET market_country = r.mc FROM r
  WHERE g.connection_id = p_connection_id AND g.external_campaign_id = r.cid
    AND NOT g.market_country_locked AND g.market_country IS DISTINCT FROM r.mc;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $f$;
REVOKE ALL ON FUNCTION public.ads_market_country_apply_google(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ads_market_country_apply_google(uuid, jsonb) TO service_role;

-- Override manual: grava e bloqueia. p_country null = desbloqueia (volta ao automático).
CREATE OR REPLACE FUNCTION public.artist_ads_set_market_country(p_platform text, p_campaign_id text, p_country text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $f$
DECLARE v_uid uuid := auth.uid(); v_c text := upper(nullif(trim(p_country),'')); v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta','tiktok') THEN RAISE EXCEPTION 'plataforma inválida' USING ERRCODE='22023'; END IF;
  IF v_c IS NOT NULL AND v_c !~ '^([A-Z]{2}|MULTI)$' THEN RAISE EXCEPTION 'país inválido (ISO-2 ou MULTI)' USING ERRCODE='22023'; END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND (v_uid IS NULL OR public.user_has_company_access(x.company_id, ARRAY['admin','manager','marketing_manager','platform_admin']::public.app_role[]));
  ELSIF p_platform = 'meta' THEN
    UPDATE crm.meta_campaign_snapshot x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND (v_uid IS NULL OR public.user_has_company_access(x.company_id, ARRAY['admin','manager','marketing_manager','platform_admin']::public.app_role[]));
  ELSE
    UPDATE crm.tiktok_campaign x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND (v_uid IS NULL OR public.user_has_company_access(x.company_id, ARRAY['admin','manager','marketing_manager','platform_admin']::public.app_role[]));
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'campanha não encontrada ou sem permissão' USING ERRCODE='42501'; END IF;
  RETURN v_n;
END $f$;
REVOKE ALL ON FUNCTION public.artist_ads_set_market_country(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_set_market_country(text, text, text) TO authenticated, service_role;

-- Assinaturas novas (p_country com default; chamadas antigas continuam a funcionar). Recriadas a partir da definição em vigor.
DO $do$
DECLARE v text := pg_get_functiondef('public.artist_ads_campaigns(uuid,boolean)'::regprocedure);
BEGIN
  IF position($o$CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 0 em falta'; END IF;
  v := replace(v, $o$CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)$o$, $n$CREATE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false, p_country text DEFAULT NULL)$n$);
  IF position($o$last_recorded_at timestamp with time zone, link_kind text)$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 1 em falta'; END IF;
  v := replace(v, $o$last_recorded_at timestamp with time zone, link_kind text)$o$, $n$last_recorded_at timestamp with time zone, link_kind text, market_country text)$n$);
  IF position($o$      gc.link_kind AS link_kind
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 2 em falta'; END IF;
  v := replace(v, $o$      gc.link_kind AS link_kind
$o$, $n$      gc.link_kind AS link_kind, gc.market_country AS market_country
$n$);
  IF position($o$      ms.link_kind
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 3 em falta'; END IF;
  v := replace(v, $o$      ms.link_kind
$o$, $n$      ms.link_kind, ms.market_country
$n$);
  IF position($o$      tc.link_kind
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 4 em falta'; END IF;
  v := replace(v, $o$      tc.link_kind
$o$, $n$      tc.link_kind, tc.market_country
$n$);
  IF position($o$r.data_source, r.last_recorded_at, r.link_kind
  FROM allrows r
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 5 em falta'; END IF;
  v := replace(v, $o$r.data_source, r.last_recorded_at, r.link_kind
  FROM allrows r
$o$, $n$r.data_source, r.last_recorded_at, r.link_kind, r.market_country
  FROM allrows r
  WHERE p_country IS NULL OR upper(coalesce(r.market_country,'?')) = upper(p_country)
$n$);
  EXECUTE 'DROP FUNCTION public.artist_ads_campaigns(uuid,boolean)';
  EXECUTE v;
END $do$;
DO $do$
DECLARE v text := pg_get_functiondef('public.artist_ads_period_report(uuid,date,date)'::regprocedure);
BEGIN
  IF position($o$CREATE OR REPLACE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date)$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 0 em falta'; END IF;
  v := replace(v, $o$CREATE OR REPLACE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date)$o$, $n$CREATE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date, p_country text DEFAULT NULL)$n$);
  IF position($o$    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 1 em falta'; END IF;
  v := replace(v, $o$    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
$o$, $n$    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
  -- D-ERP181: país de mercado por campanha ('?' = sem país).
  cmc AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, coalesce(s.market_country,'?') mc
      FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL SELECT 'google', g.connection_id, g.external_campaign_id, coalesce(g.market_country,'?')
      FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL SELECT 'tiktok', t.connection_id, t.external_campaign_id, coalesce(t.market_country,'?')
      FROM crm.tiktok_campaign t JOIN conns c ON c.id=t.connection_id
  ),
$n$);
  IF position($o$      SELECT cd.*, CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd) z
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 2 em falta'; END IF;
  v := replace(v, $o$      SELECT cd.*, CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd) z
$o$, $n$      SELECT cd.*, coalesce(k.mc,'?') ctry,
        CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd LEFT JOIN cmc k ON k.platform=cd.platform AND k.connection_id=cd.connection_id AND k.cid=cd.cid) z
    WHERE p_country IS NULL OR z.ctry = upper(p_country)
$n$);
  IF position($o$      max(currency) currency,
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 3 em falta'; END IF;
  v := replace(v, $o$      max(currency) currency,
$o$, $n$      max(currency) currency, max(ctry) ctry,
$n$);
  IF position($o$      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 4 em falta'; END IF;
  v := replace(v, $o$      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
$o$, $n$      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
      'market_country', nullif(c.ctry,'?'),
$n$);
  IF position($o$    jsonb_build_object(
      'gasto_ref', (SELECT round(sum(spend_ref),2) FROM cdr),
$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 5 em falta'; END IF;
  v := replace(v, $o$    jsonb_build_object(
      'gasto_ref', (SELECT round(sum(spend_ref),2) FROM cdr),
$o$, $n$    jsonb_build_object(
      -- D-ERP181: total convertido só com um único grupo país×moeda; senão null (ver por_pais).
      'gasto_ref', CASE WHEN (SELECT count(DISTINCT (ctry, currency)) FROM cdr WHERE spend>0) <= 1
                        THEN (SELECT round(sum(spend_ref),2) FROM cdr) END,
      'filtro_pais', upper(p_country),
      'por_pais', (SELECT coalesce(jsonb_agg(jsonb_build_object('pais', nullif(pp.ctry,'?'), 'moedas', pp.moedas) ORDER BY pp.ctry),'[]'::jsonb)
        FROM (SELECT x.ctry, jsonb_agg(jsonb_build_object(
                'currency', x.currency, 'gasto', x.g, 'impressoes', x.imp, 'cliques', x.clk,
                'ctr', CASE WHEN x.imp>0 THEN round(x.clk/x.imp*100,4) END,
                'cpc', CASE WHEN x.clk>0 THEN round(x.g/x.clk,4) END,
                'cpm', CASE WHEN x.imp>0 THEN round(x.g/x.imp*1000,4) END,
                'views', jsonb_build_object('meta_3s',x.m3s,'meta_thruplay',x.mthru,'google_views',x.gv,'tiktok_2s',x.t2s,'tiktok_6s',x.t6s),
                'campanhas', x.nc) ORDER BY x.currency) moedas
              FROM (SELECT ctry, currency, round(sum(spend),2) g, sum(imp) imp, sum(clk) clk, sum(m3s) m3s, sum(mthru) mthru,
                           sum(gviews) gv, sum(t2s) t2s, sum(t6s) t6s, count(DISTINCT (platform, connection_id, cid)) nc
                    FROM cdr GROUP BY 1,2 HAVING sum(spend)>0 OR sum(imp)>0) x
              GROUP BY x.ctry) pp),
$n$);
  IF position($o$      UNION ALL SELECT 'Alcance do período$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 6 em falta'; END IF;
  v := replace(v, $o$      UNION ALL SELECT 'Alcance do período$o$, $n$      UNION ALL SELECT 'Sem total convertido: período com vários países/moedas — usar totais.por_pais'
        WHERE (SELECT count(DISTINCT (ctry, currency)) FROM cdr WHERE spend>0) > 1
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": sem país de mercado (market_country null)'
        FROM camp_json WHERE j->>'market_country' IS NULL AND (j->>'gasto')::numeric > 0
      UNION ALL SELECT 'Alcance do período$n$);
  EXECUTE 'DROP FUNCTION public.artist_ads_period_report(uuid,date,date)';
  EXECUTE v;
END $do$;
-- Alertas: custo_view_desequilibrado só compara grupos do mesmo país.
DO $do$
DECLARE v text := pg_get_functiondef('crm.artist_ads_tiktok_alerts_core(uuid)'::regprocedure);
BEGIN
  IF position($o$coalesce(i.video_views_6s,0) AS v6, g.name AS gname$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 0 em falta'; END IF;
  v := replace(v, $o$coalesce(i.video_views_6s,0) AS v6, g.name AS gname$o$, $n$coalesce(i.video_views_6s,0) AS v6, g.name AS gname, g.market_country AS gctry$n$);
  IF position($o$SELECT g.conn, g.cid, g.dd, g.gname, g.spend / g.v6 AS cpv$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 1 em falta'; END IF;
  v := replace(v, $o$SELECT g.conn, g.cid, g.dd, g.gname, g.spend / g.v6 AS cpv$o$, $n$SELECT g.conn, g.cid, g.dd, g.gname, g.spend / g.v6 AS cpv,
      coalesce(g.gctry, tc.market_country, '?') AS ctry$n$);
  IF position($o$    SELECT conn, cid, dd, max(cpv)$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 2 em falta'; END IF;
  v := replace(v, $o$    SELECT conn, cid, dd, max(cpv)$o$, $n$    SELECT conn, cid, ctry, dd, max(cpv)$n$);
  IF position($o$FROM cpv GROUP BY 1,2,3 HAVING$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 3 em falta'; END IF;
  v := replace(v, $o$FROM cpv GROUP BY 1,2,3 HAVING$o$, $n$FROM cpv GROUP BY 1,2,3,4 HAVING$n$);
  IF position($o$b.conn = a.conn AND b.cid = a.cid AND b.dd = a.dd - 1$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 4 em falta'; END IF;
  v := replace(v, $o$b.conn = a.conn AND b.cid = a.cid AND b.dd = a.dd - 1$o$, $n$b.conn = a.conn AND b.cid = a.cid AND b.ctry = a.ctry AND b.dd = a.dd - 1$n$);
  IF position($o$        ||a.caro||' '||round$o$ in v) = 0 THEN RAISE EXCEPTION 'D-ERP181: trecho 5 em falta'; END IF;
  v := replace(v, $o$        ||a.caro||' '||round$o$, $n$        ||CASE WHEN a.ctry <> '?' THEN '['||a.ctry||'] ' ELSE '' END||a.caro||' '||round$n$);
  EXECUTE v;
END $do$;
REVOKE ALL ON FUNCTION public.artist_ads_campaigns(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_ads_period_report(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_period_report(uuid, date, date, text) TO authenticated, service_role;

-- D-ERP144 — TikTok na app: via provisória manual, compatível com o sync definitivo (25/09/2026).
-- Tabelas crm.tiktok_campaign / tiktok_adgroup / tiktok_insights_daily (espelho das Google),
-- RPC public.artist_ads_tiktok_manual_upsert e ramo 'tiktok' em artist_ads_campaigns/daily.
-- Regra de precedência: linha 'api' substitui sempre a 'manual'; 'manual' nunca substitui 'api'.

CREATE TABLE IF NOT EXISTS crm.tiktok_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  name text NOT NULL,
  status text,
  objective text,
  budget_cents bigint,
  currency text,
  linked_song_id uuid REFERENCES public.artist_songs(id) ON DELETE SET NULL,
  linked_song_locked boolean NOT NULL DEFAULT false,
  raw jsonb,
  source text NOT NULL DEFAULT 'api' CHECK (source IN ('manual','api')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_campaign_id)
);

CREATE TABLE IF NOT EXISTS crm.tiktok_adgroup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  external_adgroup_id text NOT NULL,
  name text,
  status text,
  budget_cents bigint,
  currency text,
  raw jsonb,
  source text NOT NULL DEFAULT 'api' CHECK (source IN ('manual','api')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_adgroup_id)
);

CREATE TABLE IF NOT EXISTS crm.tiktok_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('campaign','adgroup','ad')),
  external_id text NOT NULL,
  external_campaign_id text NOT NULL,
  date_start date NOT NULL,
  spend_cents bigint,
  impressions bigint,
  clicks bigint,
  video_views_6s bigint,
  video_views_2s bigint,
  likes bigint,
  follows bigint,
  reach bigint,
  currency text,
  source text NOT NULL DEFAULT 'api' CHECK (source IN ('manual','api')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  UNIQUE (connection_id, level, external_id, date_start)
);
CREATE INDEX IF NOT EXISTS tiktok_insights_daily_conn_camp_date
  ON crm.tiktok_insights_daily (connection_id, external_campaign_id, date_start);

REVOKE ALL ON crm.tiktok_campaign, crm.tiktok_adgroup, crm.tiktok_insights_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON crm.tiktok_campaign, crm.tiktok_adgroup, crm.tiktok_insights_daily TO authenticated;
GRANT ALL ON crm.tiktok_campaign, crm.tiktok_adgroup, crm.tiktok_insights_daily TO service_role;

ALTER TABLE crm.tiktok_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tiktok_adgroup ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tiktok_insights_daily ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tiktok_campaign','tiktok_adgroup','tiktok_insights_daily'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON crm.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation_select ON crm.%I FOR SELECT TO authenticated USING (company_id = public.current_company_id())', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_bypass ON crm.%I', t);
    EXECUTE format('CREATE POLICY service_role_bypass ON crm.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_tiktok_campaign_updated ON crm.tiktok_campaign;
CREATE TRIGGER trg_tiktok_campaign_updated BEFORE UPDATE ON crm.tiktok_campaign
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_tiktok_adgroup_updated ON crm.tiktok_adgroup;
CREATE TRIGGER trg_tiktok_adgroup_updated BEFORE UPDATE ON crm.tiktok_adgroup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Slug do id sintético: 'manual:<slug do nome>'.
CREATE OR REPLACE FUNCTION public.tiktok_manual_slug(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' from regexp_replace(
    translate(lower(coalesce(p_name,'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'))
$$;
REVOKE ALL ON FUNCTION public.tiktok_manual_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiktok_manual_slug(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_tiktok_manual_upsert(p_connection_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conn record;
  v_camp jsonb := coalesce(p_payload->'campanha', '{}'::jsonb);
  v_cid text;
  v_name text;
  v_song uuid;
  v_currency text;
  v_existing_src text;
  g jsonb; d jsonb;
  v_level text; v_ext text; v_date date; v_spend numeric; v_src text;
  n_camp int := 0; n_camp_skip int := 0; n_grp int := 0; n_grp_skip int := 0;
  n_day_ins int := 0; n_day_upd int := 0; n_day_skip int := 0;
  k text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_conn FROM crm.ad_platform_connections WHERE id = p_connection_id;
  IF NOT FOUND OR v_conn.platform <> 'tiktok' OR v_conn.connection_scope <> 'artist' THEN
    RAISE EXCEPTION 'ligação TikTok de artista não encontrada' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = v_uid
      AND (r.role = 'platform_admin'
           OR (r.role IN ('admin','manager','marketing_manager') AND r.company_id = v_conn.company_id))
  ) THEN
    RAISE EXCEPTION 'sem permissão na empresa da ligação' USING ERRCODE = '42501';
  END IF;

  v_currency := v_conn.selected_ad_account_currency;
  v_name := nullif(trim(v_camp->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'campanha.name obrigatório' USING ERRCODE = '22023';
  END IF;
  IF (v_camp->>'budget_cents') IS NOT NULL AND (v_camp->>'budget_cents')::numeric < 0 THEN
    RAISE EXCEPTION 'campanha.budget_cents negativo' USING ERRCODE = '22023';
  END IF;
  v_song := nullif(v_camp->>'song_id','')::uuid;
  IF v_song IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.artist_songs s WHERE s.id = v_song AND s.artist_id = v_conn.artist_id
  ) THEN
    RAISE EXCEPTION 'song_id não pertence ao artista da ligação' USING ERRCODE = '22023';
  END IF;

  -- id da campanha: explícito > campanha 'api' com o mesmo nome > sintético.
  v_cid := nullif(trim(v_camp->>'external_campaign_id'), '');
  IF v_cid IS NULL THEN
    SELECT external_campaign_id INTO v_cid FROM crm.tiktok_campaign
     WHERE connection_id = p_connection_id AND source = 'api' AND name = v_name
     ORDER BY last_synced_at DESC LIMIT 1;
  END IF;
  IF v_cid IS NULL THEN
    v_cid := 'manual:' || public.tiktok_manual_slug(v_name);
  END IF;

  SELECT source INTO v_existing_src FROM crm.tiktok_campaign
   WHERE connection_id = p_connection_id AND external_campaign_id = v_cid;
  IF v_existing_src = 'api' THEN
    n_camp_skip := 1;
  ELSE
    INSERT INTO crm.tiktok_campaign (company_id, connection_id, external_campaign_id, name, status,
      objective, budget_cents, currency, source, last_synced_at, raw)
    VALUES (v_conn.company_id, p_connection_id, v_cid, v_name, v_camp->>'status', v_camp->>'objective',
      (v_camp->>'budget_cents')::bigint, v_currency, 'manual', now(), v_camp)
    ON CONFLICT (connection_id, external_campaign_id) DO UPDATE SET
      name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective,
      budget_cents = EXCLUDED.budget_cents, currency = EXCLUDED.currency,
      last_synced_at = now(), raw = EXCLUDED.raw
    WHERE crm.tiktok_campaign.source = 'manual';
    n_camp := 1;
  END IF;
  -- Associação à música é decisão humana: aplica-se mesmo a linhas 'api'.
  IF v_song IS NOT NULL THEN
    UPDATE crm.tiktok_campaign SET linked_song_id = v_song, linked_song_locked = true
     WHERE connection_id = p_connection_id AND external_campaign_id = v_cid;
  END IF;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'grupos','[]'::jsonb)) LOOP
    v_ext := nullif(trim(g->>'external_adgroup_id'), '');
    IF v_ext IS NULL THEN
      RAISE EXCEPTION 'grupos[].external_adgroup_id obrigatório' USING ERRCODE = '22023';
    END IF;
    IF (g->>'budget_cents') IS NOT NULL AND (g->>'budget_cents')::numeric < 0 THEN
      RAISE EXCEPTION 'grupo % com budget_cents negativo', v_ext USING ERRCODE = '22023';
    END IF;
    SELECT source INTO v_src FROM crm.tiktok_adgroup WHERE connection_id = p_connection_id AND external_adgroup_id = v_ext;
    IF v_src = 'api' THEN
      n_grp_skip := n_grp_skip + 1;
    ELSE
      INSERT INTO crm.tiktok_adgroup (company_id, connection_id, external_campaign_id, external_adgroup_id,
        name, status, budget_cents, currency, source, last_synced_at, raw)
      VALUES (v_conn.company_id, p_connection_id, v_cid, v_ext, g->>'name', g->>'status',
        (g->>'budget_cents')::bigint, v_currency, 'manual', now(), g)
      ON CONFLICT (connection_id, external_adgroup_id) DO UPDATE SET
        external_campaign_id = EXCLUDED.external_campaign_id, name = EXCLUDED.name, status = EXCLUDED.status,
        budget_cents = EXCLUDED.budget_cents, currency = EXCLUDED.currency, last_synced_at = now(), raw = EXCLUDED.raw
      WHERE crm.tiktok_adgroup.source = 'manual';
      n_grp := n_grp + 1;
    END IF;
    v_src := NULL;
  END LOOP;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'dias','[]'::jsonb)) LOOP
    v_level := coalesce(d->>'level', 'adgroup');
    IF v_level NOT IN ('campaign','adgroup') THEN
      RAISE EXCEPTION 'dias[].level inválido: %', v_level USING ERRCODE = '22023';
    END IF;
    v_date := (d->>'date')::date;
    IF v_date IS NULL OR v_date > current_date THEN
      RAISE EXCEPTION 'dias[].date inválida ou futura: %', d->>'date' USING ERRCODE = '22023';
    END IF;
    v_ext := coalesce(nullif(trim(d->>'external_id'),''), CASE WHEN v_level = 'campaign' THEN v_cid END);
    IF v_ext IS NULL THEN
      RAISE EXCEPTION 'dias[].external_id obrigatório no nível adgroup' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['spend','impressions','clicks','video_views_6s','video_views_2s','likes','follows','reach'] LOOP
      IF (d->>k) IS NOT NULL AND (d->>k)::numeric < 0 THEN
        RAISE EXCEPTION 'dias[].% negativo (%)', k, d->>'date' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_spend := (d->>'spend')::numeric;

    SELECT source INTO v_src FROM crm.tiktok_insights_daily
     WHERE connection_id = p_connection_id AND level = v_level AND external_id = v_ext AND date_start = v_date;
    IF v_src = 'api' THEN
      n_day_skip := n_day_skip + 1;
    ELSE
      IF v_src IS NULL THEN n_day_ins := n_day_ins + 1; ELSE n_day_upd := n_day_upd + 1; END IF;
      INSERT INTO crm.tiktok_insights_daily (company_id, connection_id, level, external_id, external_campaign_id,
        date_start, spend_cents, impressions, clicks, video_views_6s, video_views_2s, likes, follows, reach,
        currency, source, recorded_at, raw)
      VALUES (v_conn.company_id, p_connection_id, v_level, v_ext, v_cid, v_date,
        CASE WHEN v_spend IS NULL THEN NULL ELSE round(v_spend * 100)::bigint END,
        (d->>'impressions')::bigint, (d->>'clicks')::bigint, (d->>'video_views_6s')::bigint,
        (d->>'video_views_2s')::bigint, (d->>'likes')::bigint, (d->>'follows')::bigint, (d->>'reach')::bigint,
        v_currency, 'manual', now(), d)
      ON CONFLICT (connection_id, level, external_id, date_start) DO UPDATE SET
        external_campaign_id = EXCLUDED.external_campaign_id, spend_cents = EXCLUDED.spend_cents,
        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, video_views_6s = EXCLUDED.video_views_6s,
        video_views_2s = EXCLUDED.video_views_2s, likes = EXCLUDED.likes, follows = EXCLUDED.follows,
        reach = EXCLUDED.reach, currency = EXCLUDED.currency, recorded_at = now(), raw = EXCLUDED.raw
      WHERE crm.tiktok_insights_daily.source = 'manual';
    END IF;
    v_src := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'external_campaign_id', v_cid,
    'campanha', jsonb_build_object('gravada', n_camp, 'ignorada_api', n_camp_skip),
    'grupos', jsonb_build_object('gravados', n_grp, 'ignorados_api', n_grp_skip),
    'dias', jsonb_build_object('inseridos', n_day_ins, 'atualizados', n_day_upd, 'ignorados_api', n_day_skip));
END;
$$;
REVOKE ALL ON FUNCTION public.artist_ads_tiktok_manual_upsert(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_tiktok_manual_upsert(uuid, jsonb) TO authenticated, service_role;

-- Painel: ramo 'tiktok' + colunas no fim data_source / last_recorded_at.
DROP FUNCTION IF EXISTS public.artist_ads_campaigns(uuid, boolean);
CREATE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)
 RETURNS TABLE(platform text, connection_id uuid, connection_status text, account_id text, account_name text, currency text, campaign_id text, campaign_name text, status text, objective text, budget_daily numeric, start_date date, end_date date, spend_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, video_views_30d bigint, results_30d numeric, cpc_30d numeric, cpv_30d numeric, last_synced_at timestamp with time zone, linked_song_id uuid, linked_event_id uuid, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  g_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 AND coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+$'
               THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::bigint ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.conversions ELSE 0 END) AS results_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      sum(CASE WHEN i.date_start >= current_date - 6
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_7d_ref,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_30d_ref,
      count(DISTINCT i.date_start) FILTER (
        WHERE i.date_start >= current_date - 29 AND coalesce(i.spend_cents,0) > 0
          AND public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                r.ref_currency, i.date_start) IS NULL
      )::integer AS fx_missing_days
    FROM crm.google_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE c.platform = 'google'
    GROUP BY 1,2
  ),
  m_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN coalesce(i.video_thruplays, i.video_3s_views, i.video_plays, 0) ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN coalesce(i.purchases_count,0) + coalesce(i.leads_count,0) ELSE 0 END)::numeric AS results_30d,
      sum(CASE WHEN i.date_start >= current_date - 6
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_7d_ref,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_30d_ref,
      count(DISTINCT i.date_start) FILTER (
        WHERE i.date_start >= current_date - 29 AND coalesce(i.spend_cents,0) > 0
          AND public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                r.ref_currency, i.date_start) IS NULL
      )::integer AS fx_missing_days
    FROM crm.meta_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE c.platform = 'meta'
    GROUP BY 1,2
  ),
  -- TikTok: nível 'campaign' quando existe nesse dia; senão soma dos 'adgroup'.
  t_lv AS (
    SELECT i.*, bool_or(i.level = 'campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) AS has_c
    FROM crm.tiktok_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'tiktok'
    WHERE i.level IN ('campaign','adgroup')
  ),
  t_day AS (SELECT * FROM t_lv WHERE (has_c AND level = 'campaign') OR (NOT has_c AND level = 'adgroup')),
  t_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_views_6s, i.video_views_2s, 0) ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 6
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_7d_ref,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_30d_ref,
      count(DISTINCT i.date_start) FILTER (
        WHERE i.date_start >= current_date - 29 AND coalesce(i.spend_cents,0) > 0
          AND public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                r.ref_currency, i.date_start) IS NULL
      )::integer AS fx_missing_days,
      CASE WHEN bool_and(i.source = 'api') THEN 'api' WHEN bool_and(i.source = 'manual') THEN 'manual' ELSE 'mixed' END AS data_source,
      max(i.recorded_at) AS last_recorded_at
    FROM t_day i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    GROUP BY 1,2
  ),
  allrows AS (
    SELECT 'google'::text AS platform, c.id AS connection_id, c.status AS connection_status,
      c.selected_ad_account_id AS account_id, c.selected_ad_account_name AS account_name,
      coalesce(c.selected_ad_account_currency, i.currency) AS currency,
      gc.external_campaign_id AS campaign_id, gc.name AS campaign_name, gc.status AS status,
      gc.advertising_channel_type AS objective,
      gc.budget_amount_micros / 1000000.0 AS budget_daily,
      gc.start_date AS start_date, gc.end_date AS end_date,
      coalesce(i.spend_7d,0) AS spend_7d, coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d, coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      coalesce(i.video_views_30d,0)::bigint AS video_views_30d, coalesce(i.results_30d,0) AS results_30d,
      gc.last_synced_at AS last_synced_at, gc.linked_song_id AS linked_song_id, gc.linked_event_id AS linked_event_id,
      i.spend_7d_ref AS spend_7d_ref, i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days,
      'api'::text AS data_source, gc.last_synced_at AS last_recorded_at
    FROM conns c
    JOIN crm.google_campaign gc ON gc.connection_id = c.id
    LEFT JOIN g_ins i ON i.connection_id = gc.connection_id AND i.external_campaign_id = gc.external_campaign_id
    WHERE c.platform = 'google'
      AND (p_include_removed OR upper(coalesce(gc.status,'')) NOT IN ('REMOVED','DELETED'))
    UNION ALL
    SELECT 'meta'::text, c.id, c.status,
      c.selected_ad_account_id, c.selected_ad_account_name,
      coalesce(ms.currency, c.selected_ad_account_currency),
      ms.external_campaign_id, ms.name, coalesce(ms.effective_status, ms.status),
      ms.objective,
      coalesce(ms.daily_budget_cents,0) / 100.0,
      (ms.start_time)::date, (ms.stop_time)::date,
      coalesce(i.spend_7d,0), coalesce(i.spend_30d,0),
      coalesce(i.impressions_30d,0)::bigint, coalesce(i.clicks_30d,0)::bigint,
      coalesce(i.video_views_30d,0)::bigint, coalesce(i.results_30d,0),
      ms.last_synced_at, ms.linked_song_id, ms.linked_event_id,
      i.spend_7d_ref, i.spend_30d_ref, coalesce(i.fx_missing_days,0),
      'api'::text, ms.last_synced_at
    FROM conns c
    JOIN crm.meta_campaign_snapshot ms ON ms.connection_id = c.id
    LEFT JOIN m_ins i ON i.connection_id = ms.connection_id AND i.external_campaign_id = ms.external_campaign_id
    WHERE c.platform = 'meta'
      AND (p_include_removed OR upper(coalesce(ms.effective_status, ms.status,'')) NOT IN ('DELETED','REMOVED','ARCHIVED'))
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.status,
      c.selected_ad_account_id, c.selected_ad_account_name,
      coalesce(tc.currency, c.selected_ad_account_currency),
      tc.external_campaign_id, tc.name, tc.status, tc.objective,
      coalesce(tc.budget_cents,0) / 100.0,
      NULL::date, NULL::date,
      coalesce(i.spend_7d,0), coalesce(i.spend_30d,0),
      coalesce(i.impressions_30d,0)::bigint, coalesce(i.clicks_30d,0)::bigint,
      coalesce(i.video_views_30d,0)::bigint, 0::numeric,
      tc.last_synced_at, tc.linked_song_id, NULL::uuid,
      i.spend_7d_ref, i.spend_30d_ref, coalesce(i.fx_missing_days,0),
      coalesce(i.data_source, tc.source), coalesce(i.last_recorded_at, tc.last_synced_at)
    FROM conns c
    JOIN crm.tiktok_campaign tc ON tc.connection_id = c.id
    LEFT JOIN t_ins i ON i.connection_id = tc.connection_id AND i.external_campaign_id = tc.external_campaign_id
    WHERE c.platform = 'tiktok'
      AND (p_include_removed OR upper(coalesce(tc.status,'')) NOT IN ('DELETE','DELETED','REMOVED'))
  )
  SELECT r.platform, r.connection_id, r.connection_status, r.account_id, r.account_name, r.currency,
    r.campaign_id, r.campaign_name, r.status, r.objective, r.budget_daily, r.start_date, r.end_date,
    r.spend_7d, r.spend_30d, r.impressions_30d, r.clicks_30d, r.video_views_30d, r.results_30d,
    CASE WHEN r.clicks_30d > 0 THEN round(r.spend_30d / r.clicks_30d, 4) END,
    CASE WHEN r.video_views_30d > 0 THEN round(r.spend_30d / r.video_views_30d, 4) END,
    r.last_synced_at, r.linked_song_id, r.linked_event_id,
    (SELECT ref_currency FROM ref), r.spend_7d_ref, r.spend_30d_ref, r.fx_missing_days,
    r.data_source, r.last_recorded_at
  FROM allrows r
  ORDER BY r.spend_30d DESC, r.start_date DESC NULLS LAST
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_campaigns(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.artist_ads_daily(uuid, integer);
CREATE FUNCTION public.artist_ads_daily(p_artist_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(platform text, connection_id uuid, account_id text, campaign_id text, campaign_name text, day date, spend numeric, currency text, impressions bigint, clicks bigint, video_views bigint, results numeric, ref_currency text, spend_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level = 'campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) AS has_c
    FROM crm.tiktok_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'tiktok'
    WHERE i.level IN ('campaign','adgroup')
      AND i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
  ),
  t_day AS (
    SELECT i.connection_id, i.external_campaign_id, i.date_start,
      sum(i.spend_cents) AS spend_cents, sum(i.impressions) AS impressions, sum(i.clicks) AS clicks,
      sum(coalesce(i.video_views_6s, i.video_views_2s, 0)) AS video_views,
      (array_agg(i.currency) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      CASE WHEN bool_and(i.source = 'api') THEN 'api' WHEN bool_and(i.source = 'manual') THEN 'manual' ELSE 'mixed' END AS data_source,
      max(i.recorded_at) AS recorded_at
    FROM t_lv i
    WHERE (i.has_c AND i.level = 'campaign') OR (NOT i.has_c AND i.level = 'adgroup')
    GROUP BY 1,2,3
  ),
  s AS (
    SELECT 'google'::text AS platform, c.id AS connection_id,
      c.selected_ad_account_id AS account_id,
      i.external_campaign_id AS campaign_id, i.campaign_name AS campaign_name,
      i.date_start AS day, i.spend_cents/100.0 AS spend,
      coalesce(i.impressions,0)::bigint AS impressions, coalesce(i.clicks,0)::bigint AS clicks,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+$' THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::bigint ELSE 0 END AS video_views,
      coalesce(i.conversions,0) AS results,
      coalesce(i.currency, c.selected_ad_account_currency) AS row_currency,
      'api'::text AS data_source, NULL::timestamptz AS last_recorded_at
    FROM crm.google_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'google'
    WHERE i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'meta'::text, c.id, c.selected_ad_account_id,
      i.external_campaign_id, i.campaign_name, i.date_start, i.spend_cents/100.0,
      coalesce(i.impressions,0)::bigint, coalesce(i.clicks,0)::bigint,
      coalesce(i.video_thruplays, i.video_3s_views, i.video_plays, 0)::bigint,
      (coalesce(i.purchases_count,0) + coalesce(i.leads_count,0))::numeric,
      coalesce(i.currency, c.selected_ad_account_currency),
      'api'::text, NULL::timestamptz
    FROM crm.meta_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'meta'
    WHERE i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.selected_ad_account_id,
      d.external_campaign_id, tc.name, d.date_start, d.spend_cents/100.0,
      coalesce(d.impressions,0)::bigint, coalesce(d.clicks,0)::bigint,
      coalesce(d.video_views,0)::bigint, 0::numeric,
      coalesce(d.currency, c.selected_ad_account_currency),
      d.data_source, d.recorded_at
    FROM t_day d
    JOIN conns c ON c.id = d.connection_id
    LEFT JOIN crm.tiktok_campaign tc ON tc.connection_id = d.connection_id AND tc.external_campaign_id = d.external_campaign_id
  ),
  conv AS (
    SELECT s.*, r.ref_currency,
      public.fx_convert(s.spend, s.row_currency, r.ref_currency, s.day) AS spend_ref
    FROM s CROSS JOIN ref r
  )
  SELECT c.platform, c.connection_id, c.account_id, c.campaign_id, c.campaign_name, c.day,
    c.spend, c.row_currency, c.impressions, c.clicks, c.video_views, c.results,
    c.ref_currency, c.spend_ref,
    (CASE WHEN c.spend > 0 AND c.spend_ref IS NULL THEN 1 ELSE 0 END)::integer,
    c.data_source, c.last_recorded_at
  FROM conv c ORDER BY c.day, c.platform, c.campaign_id
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_daily(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_daily(uuid, integer) TO authenticated, service_role;

-- Dados: campanha [MP] TikTok do Litto e os 2 grupos (via manual, sem métricas). Idempotente.
INSERT INTO crm.tiktok_campaign (company_id, connection_id, external_campaign_id, name, status, objective,
  budget_cents, currency, linked_song_id, linked_song_locked, source, last_synced_at)
SELECT c.company_id, c.id, 'manual:mp-roupa-de-solteira-visualizacoes-ugc-2026-09-25',
  '[MP] [ROUPA DE SOLTEIRA] [Visualizações UGC] 2026-09-25', 'ENABLE', NULL,
  25000, 'BRL', '74c40d7b-357b-4311-acbe-eb9bfa7ba7c7', true, 'manual', now()
FROM crm.ad_platform_connections c
WHERE c.id = '947ee0c7-60a4-49f6-9882-561237c3483a'
ON CONFLICT (connection_id, external_campaign_id) DO NOTHING;

INSERT INTO crm.tiktok_adgroup (company_id, connection_id, external_campaign_id, external_adgroup_id,
  name, status, budget_cents, currency, source, last_synced_at)
SELECT c.company_id, c.id, 'manual:mp-roupa-de-solteira-visualizacoes-ugc-2026-09-25', g.ext, g.nm,
  'ENABLE', 12500, 'BRL', 'manual', now()
FROM crm.ad_platform_connections c
CROSS JOIN (VALUES ('1877256463382802','A1 #forro'), ('1877257271732434','A2 aberto')) AS g(ext, nm)
WHERE c.id = '947ee0c7-60a4-49f6-9882-561237c3483a'
ON CONFLICT (connection_id, external_adgroup_id) DO NOTHING;
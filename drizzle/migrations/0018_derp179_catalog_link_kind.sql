-- D-ERP179: catálogo do artista + tipo de ligação das campanhas.
ALTER TABLE public.artist_songs DROP CONSTRAINT IF EXISTS artist_songs_tracking_status_check;
ALTER TABLE public.artist_songs ADD CONSTRAINT artist_songs_tracking_status_check
  CHECK (tracking_status = ANY (ARRAY['ativo','pausado','arquivado','catalogo']));

ALTER TABLE crm.google_campaign ADD COLUMN IF NOT EXISTS link_kind text, ADD COLUMN IF NOT EXISTS link_kind_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.meta_campaign_snapshot ADD COLUMN IF NOT EXISTS link_kind text, ADD COLUMN IF NOT EXISTS link_kind_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.tiktok_campaign ADD COLUMN IF NOT EXISTS link_kind text, ADD COLUMN IF NOT EXISTS link_kind_locked boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE crm.google_campaign ADD CONSTRAINT google_campaign_link_kind_check CHECK (link_kind IN ('song','profile','event'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE crm.meta_campaign_snapshot ADD CONSTRAINT meta_campaign_snapshot_link_kind_check CHECK (link_kind IN ('song','profile','event'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE crm.tiktok_campaign ADD CONSTRAINT tiktok_campaign_link_kind_check CHECK (link_kind IN ('song','profile','event'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Candidato único de música para um nome de campanha (null = nenhum ou ambíguo).
CREATE OR REPLACE FUNCTION crm.artist_ads_song_for_name(p_artist_id uuid, p_company_id uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public','crm' AS $f$
  WITH n AS (SELECT ' '||public.artist_ads_norm(p_name)||' ' AS nm),
  segs AS (
    SELECT public.artist_ads_norm(x) AS sg
    FROM regexp_split_to_table(coalesce(p_name,''), '[\[\]|]') x
  ),
  songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt,
      s.tracking_status, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = p_company_id
  ),
  hits AS (
    SELECT s.* FROM songs s, n
    WHERE s.bt <> '' AND (
      (length(replace(s.bt,' ','')) > 4 AND n.nm LIKE '% '||s.bt||' %')
      OR (length(replace(s.bt,' ','')) <= 4 AND EXISTS (SELECT 1 FROM segs WHERE segs.sg = s.bt))
    )
  ),
  -- remove títulos contidos noutro título encontrado (ex.: "volta" dentro de "volta pra mim")
  maxi AS (
    SELECT h.* FROM hits h
    WHERE NOT EXISTS (SELECT 1 FROM hits o WHERE o.bt <> h.bt AND (' '||o.bt||' ') LIKE ('% '||h.bt||' %'))
  )
  SELECT CASE WHEN (SELECT count(DISTINCT bt) FROM maxi) = 1 THEN
    (SELECT id FROM maxi ORDER BY (tracking_status='ativo') DESC, created_at ASC LIMIT 1) END
$f$;

CREATE OR REPLACE FUNCTION crm.artist_ads_profile_name(p_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $f$
  SELECT ' '||public.artist_ads_norm(p_name)||' ' ~ ' (visitas ao perfil|seguidores|branding|reconhecimento|publicacao do instagram) '
      OR lower(translate(coalesce(p_name,''),'ÚúÉé','UuEe')) LIKE '%[seu perfil]%'
$f$;

CREATE OR REPLACE FUNCTION crm.artist_ads_event_for_name(p_company_id uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  WITH c AS (
    SELECT e.id FROM public.events e
    WHERE e.company_id = p_company_id AND length(public.artist_ads_norm(e.name)) >= 8
      AND ' '||public.artist_ads_norm(p_name)||' ' LIKE '% '||public.artist_ads_norm(e.name)||' %'
  )
  SELECT CASE WHEN (SELECT count(*) FROM c) = 1 THEN (SELECT id FROM c) END
$f$;

CREATE OR REPLACE FUNCTION crm.artist_ads_autolink_songs_core(p_artist_id uuid, p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public','crm' AS $function$
DECLARE v_total int := 0; v_n int;
BEGIN
  -- 1) música (nunca sobrescreve ligações existentes nem trancadas)
  UPDATE crm.google_campaign gc SET linked_song_id = x.sid
  FROM (SELECT gc2.id, crm.artist_ads_song_for_name(p_artist_id, p_company_id, gc2.name) sid
        FROM crm.google_campaign gc2 JOIN crm.ad_platform_connections c ON c.id = gc2.connection_id
          AND c.connection_scope='artist' AND c.artist_id = p_artist_id
        WHERE gc2.linked_song_id IS NULL AND NOT gc2.linked_song_locked) x
  WHERE gc.id = x.id AND x.sid IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  UPDATE crm.meta_campaign_snapshot ms SET linked_song_id = x.sid
  FROM (SELECT m2.id, crm.artist_ads_song_for_name(p_artist_id, p_company_id, m2.name) sid
        FROM crm.meta_campaign_snapshot m2 JOIN crm.ad_platform_connections c ON c.id = m2.connection_id
          AND c.connection_scope='artist' AND c.artist_id = p_artist_id
        WHERE m2.linked_song_id IS NULL AND NOT m2.linked_song_locked) x
  WHERE ms.id = x.id AND x.sid IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- 2) tipo de ligação (só onde não foi decidido à mão)
  UPDATE crm.google_campaign gc SET link_kind = CASE
      WHEN gc.linked_song_id IS NOT NULL THEN 'song'
      WHEN gc.linked_event_id IS NOT NULL OR crm.artist_ads_event_for_name(p_company_id, gc.name) IS NOT NULL THEN 'event'
      WHEN crm.artist_ads_profile_name(gc.name) THEN 'profile' END,
    linked_event_id = coalesce(gc.linked_event_id, CASE WHEN gc.linked_song_id IS NULL AND NOT gc.linked_event_locked
      THEN crm.artist_ads_event_for_name(p_company_id, gc.name) END)
  FROM crm.ad_platform_connections c
  WHERE c.id = gc.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT gc.link_kind_locked;

  UPDATE crm.meta_campaign_snapshot ms SET link_kind = CASE
      WHEN ms.linked_song_id IS NOT NULL THEN 'song'
      WHEN ms.linked_event_id IS NOT NULL OR crm.artist_ads_event_for_name(p_company_id, ms.name) IS NOT NULL THEN 'event'
      WHEN crm.artist_ads_profile_name(ms.name) THEN 'profile' END,
    linked_event_id = coalesce(ms.linked_event_id, CASE WHEN ms.linked_song_id IS NULL AND NOT ms.linked_event_locked
      THEN crm.artist_ads_event_for_name(p_company_id, ms.name) END)
  FROM crm.ad_platform_connections c
  WHERE c.id = ms.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT ms.link_kind_locked;

  UPDATE crm.tiktok_campaign tc SET link_kind = CASE
      WHEN tc.linked_song_id IS NOT NULL THEN 'song'
      WHEN crm.artist_ads_profile_name(tc.name) THEN 'profile' END
  FROM crm.ad_platform_connections c
  WHERE c.id = tc.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT tc.link_kind_locked;

  RETURN v_total;
END $function$;

-- Ligação manual de música também fixa o tipo 'song'.
CREATE OR REPLACE FUNCTION public.artist_ads_link_song(p_platform text, p_campaign_id text, p_song_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $function$
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
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign SET linked_song_id = p_song_id, linked_song_locked = true,
      link_kind = 'song', link_kind_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  ELSE
    UPDATE crm.meta_campaign_snapshot SET linked_song_id = p_song_id, linked_song_locked = true,
      link_kind = 'song', link_kind_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- Tipo de ligação à mão (null = volta a "por decidir", trancado).
CREATE OR REPLACE FUNCTION public.artist_ads_set_link_kind(p_platform text, p_campaign_id text, p_artist_id uuid, p_kind text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','crm' AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta','tiktok') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('song','profile','event') THEN
    RAISE EXCEPTION 'tipo inválido' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(p_artist_id);
  IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  ELSIF p_platform = 'meta' THEN
    UPDATE crm.meta_campaign_snapshot x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  ELSE
    UPDATE crm.tiktok_campaign x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.artist_ads_set_link_kind(text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_set_link_kind(text,text,uuid,text) TO authenticated, service_role;

-- artist_ads_campaigns: + link_kind no fim (consumidores SQL usam colunas por nome).
DROP FUNCTION IF EXISTS public.artist_ads_campaigns(uuid, boolean);
CREATE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)
 RETURNS TABLE(platform text, connection_id uuid, connection_status text, account_id text, account_name text, currency text, campaign_id text, campaign_name text, status text, objective text, budget_daily numeric, start_date date, end_date date, spend_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, video_views_30d bigint, results_30d numeric, cpc_30d numeric, cpv_30d numeric, last_synced_at timestamp with time zone, linked_song_id uuid, linked_event_id uuid, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone, link_kind text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'crm'
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
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_views_6s,0) ELSE 0 END)::numeric AS results_30d,
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
      'api'::text AS data_source, gc.last_synced_at AS last_recorded_at,
      gc.link_kind AS link_kind
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
      'api'::text, ms.last_synced_at,
      ms.link_kind
    FROM conns c
    JOIN crm.meta_campaign_snapshot ms ON ms.connection_id = c.id
    LEFT JOIN m_ins i ON i.connection_id = ms.connection_id AND i.external_campaign_id = ms.external_campaign_id
    WHERE c.platform = 'meta'
      AND (p_include_removed OR upper(coalesce(ms.effective_status, ms.status,'')) NOT IN ('DELETED','REMOVED','ARCHIVED'))
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.status,
      c.selected_ad_account_id, c.selected_ad_account_name,
      coalesce(tc.currency, c.selected_ad_account_currency),
      tc.external_campaign_id, tc.name,
      CASE upper(coalesce(tc.status,'')) WHEN 'ENABLE' THEN 'ACTIVE' WHEN 'DISABLE' THEN 'PAUSED'
        WHEN 'DELETE' THEN 'DELETED' ELSE tc.status END,
      tc.objective,
      coalesce(nullif(tc.budget_cents,0),
        (SELECT sum(ag.budget_cents) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id = tc.connection_id AND ag.external_campaign_id = tc.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')), 0) / 100.0,
      NULL::date, NULL::date,
      coalesce(i.spend_7d,0), coalesce(i.spend_30d,0),
      coalesce(i.impressions_30d,0)::bigint, coalesce(i.clicks_30d,0)::bigint,
      coalesce(i.video_views_30d,0)::bigint, coalesce(i.results_30d,0),
      tc.last_synced_at, tc.linked_song_id, NULL::uuid,
      i.spend_7d_ref, i.spend_30d_ref, coalesce(i.fx_missing_days,0),
      coalesce(i.data_source, tc.source), coalesce(i.last_recorded_at, tc.last_synced_at),
      tc.link_kind
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
    r.data_source, r.last_recorded_at, r.link_kind
  FROM allrows r
  ORDER BY r.spend_30d DESC, r.start_date DESC NULLS LAST
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_campaigns(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean) TO authenticated, service_role;

-- Resumo para o aviso do Painel.
CREATE OR REPLACE FUNCTION public.artist_ads_unlinked_summary(p_artist_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','crm' AS $f$
  WITH u AS (
    SELECT c.*, (upper(coalesce(c.status,'')) IN ('ACTIVE','ENABLED') OR coalesce(c.spend_30d,0) > 0) AS vivo
    FROM public.artist_ads_campaigns(p_artist_id, false) c
    WHERE c.linked_song_id IS NULL AND c.linked_event_id IS NULL AND c.link_kind IS NULL
  )
  SELECT jsonb_build_object(
    'a_decidir', (SELECT count(*) FROM u WHERE vivo),
    'historico_sem_musica', (SELECT count(*) FROM u WHERE NOT vivo),
    'a_decidir_lista', coalesce((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'campaign_id', campaign_id,
        'campaign_name', campaign_name, 'status', status, 'spend_30d', spend_30d) ORDER BY spend_30d DESC)
      FROM u WHERE vivo), '[]'::jsonb))
$f$;
REVOKE ALL ON FUNCTION public.artist_ads_unlinked_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlinked_summary(uuid) TO authenticated, service_role;

-- Tráfego: TikTok ENABLE/DISABLE/DELETE normalizado para ACTIVE/PAUSED/DELETED; orçamento/dia = soma dos grupos activos quando a campanha não tem orçamento.
CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)
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
      -- D-ERP144 adenda: Resultados TikTok = visualizações de 6 s (otimização dos grupos)
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
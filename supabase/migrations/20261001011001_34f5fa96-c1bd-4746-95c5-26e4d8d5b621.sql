-- artist_ads_daily: expõe métricas TikTok gravadas (6s, likes, follows, view_content, button_click). NULL fica NULL.
DROP FUNCTION IF EXISTS public.artist_ads_daily(uuid, integer);
CREATE FUNCTION public.artist_ads_daily(p_artist_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(platform text, connection_id uuid, account_id text, campaign_id text, campaign_name text, day date, spend numeric, currency text, impressions bigint, clicks bigint, video_views bigint, results numeric, ref_currency text, spend_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone,
   video_views_6s bigint, likes bigint, follows bigint, view_content bigint, button_click bigint)
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
      -- D-ERP144 adenda: Resultados TikTok = visualizações de 6 s do dia
      sum(coalesce(i.video_views_6s,0)) AS results_6s,
      sum(i.video_views_6s)::bigint AS v6s, sum(i.likes)::bigint AS likes, sum(i.follows)::bigint AS follows,
      sum(i.view_content)::bigint AS view_content, sum(i.button_click)::bigint AS button_click,
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
      'api'::text AS data_source, NULL::timestamptz AS last_recorded_at,
      NULL::bigint AS video_views_6s, NULL::bigint AS likes, NULL::bigint AS follows, NULL::bigint AS view_content, NULL::bigint AS button_click
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
      'api'::text, NULL::timestamptz,
      NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint
    FROM crm.meta_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'meta'
    WHERE i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.selected_ad_account_id,
      d.external_campaign_id, tc.name, d.date_start, d.spend_cents/100.0,
      coalesce(d.impressions,0)::bigint, coalesce(d.clicks,0)::bigint,
      coalesce(d.video_views,0)::bigint, coalesce(d.results_6s,0)::numeric,
      coalesce(d.currency, c.selected_ad_account_currency),
      d.data_source, d.recorded_at,
      d.v6s, d.likes, d.follows, d.view_content, d.button_click
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
    c.data_source, c.last_recorded_at,
    c.video_views_6s, c.likes, c.follows, c.view_content, c.button_click
  FROM conv c ORDER BY c.day, c.platform, c.campaign_id
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_daily(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_daily(uuid, integer) TO authenticated, service_role;
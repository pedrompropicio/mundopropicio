-- D-ERP91: moeda real nas campanhas Google + nível anúncio para scope artist.

CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)
 RETURNS TABLE(platform text, connection_id uuid, connection_status text, account_id text, account_name text, currency text, campaign_id text, campaign_name text, status text, objective text, budget_daily numeric, start_date date, end_date date, spend_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, video_views_30d bigint, results_30d numeric, cpc_30d numeric, cpv_30d numeric, last_synced_at timestamp with time zone, linked_song_id uuid, linked_event_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
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
      sum(CASE WHEN i.date_start >= current_date - 29 AND i.raw->>'video_views' ~ '^[0-9]+$'
               THEN (i.raw->>'video_views')::bigint ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.conversions ELSE 0 END) AS results_30d,
      -- D-ERP91: moeda mais recente vinda dos dados diários (reserva quando a
      -- conta foi registada por ID e ficou sem selected_ad_account_currency).
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency
    FROM crm.google_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform = 'google')
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
               THEN coalesce(i.purchases_count,0) + coalesce(i.leads_count,0) ELSE 0 END)::numeric AS results_30d
    FROM crm.meta_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform = 'meta')
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
      gc.last_synced_at AS last_synced_at, gc.linked_song_id AS linked_song_id, gc.linked_event_id AS linked_event_id
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
      ms.last_synced_at, ms.linked_song_id, ms.linked_event_id
    FROM conns c
    JOIN crm.meta_campaign_snapshot ms ON ms.connection_id = c.id
    LEFT JOIN m_ins i ON i.connection_id = ms.connection_id AND i.external_campaign_id = ms.external_campaign_id
    WHERE c.platform = 'meta'
      AND (p_include_removed OR upper(coalesce(ms.effective_status, ms.status,'')) NOT IN ('DELETED','REMOVED','ARCHIVED'))
  )
  SELECT r.platform, r.connection_id, r.connection_status, r.account_id, r.account_name, r.currency,
    r.campaign_id, r.campaign_name, r.status, r.objective, r.budget_daily, r.start_date, r.end_date,
    r.spend_7d, r.spend_30d, r.impressions_30d, r.clicks_30d, r.video_views_30d, r.results_30d,
    CASE WHEN r.clicks_30d > 0 THEN round(r.spend_30d / r.clicks_30d, 4) END,
    CASE WHEN r.video_views_30d > 0 THEN round(r.spend_30d / r.video_views_30d, 4) END,
    r.last_synced_at, r.linked_song_id, r.linked_event_id
  FROM allrows r
  ORDER BY r.spend_30d DESC, r.start_date DESC NULLS LAST
$function$;

-- Nível anúncio (só Meta: o Google não tem nível anúncio na base; a coluna
-- platform fica pronta para o futuro). Mesmo modelo de segurança de
-- artist_ads_campaigns: artist_ads_assert_access + só connections
-- connection_scope='artist' desse artista e da empresa do guard.
CREATE OR REPLACE FUNCTION public.artist_ads_ads(p_artist_id uuid, p_campaign_id text DEFAULT NULL)
 RETURNS TABLE(
   platform text, connection_id uuid, currency text,
   campaign_id text, campaign_name text, adset_id text, adset_name text,
   ad_id text, ad_name text, status text,
   creative_id text, thumbnail_url text, permalink text,
   spend_7d numeric, impressions_7d bigint, clicks_7d bigint, ctr_7d numeric, cpc_7d numeric,
   video_3s_views_7d bigint, thruplays_7d bigint, cost_per_thruplay_7d numeric,
   spend_30d numeric, impressions_30d bigint, clicks_30d bigint, ctr_30d numeric, cpc_30d numeric,
   video_3s_views_30d bigint, thruplays_30d bigint, cost_per_thruplay_30d numeric,
   linked_song_id uuid, last_synced_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'meta'
  ),
  ins AS (
    SELECT i.connection_id, i.external_ad_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_3s_views,0) ELSE 0 END) AS v3s_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_3s_views,0) ELSE 0 END) AS v3s_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency
    FROM crm.meta_ad_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns)
    GROUP BY 1,2
  ),
  base AS (
    SELECT
      'meta'::text AS platform,
      c.id AS connection_id,
      coalesce(i.currency, ms.currency, c.selected_ad_account_currency) AS currency,
      a.external_campaign_id AS campaign_id,
      coalesce(ms.name, a.raw->>'campaign_name') AS campaign_name,
      nullif(a.external_adset_id,'') AS adset_id,
      asn.name AS adset_name,
      a.external_ad_id AS ad_id,
      a.name AS ad_name,
      coalesce(a.effective_status, a.status) AS status,
      coalesce(a.meta_creative_id, a.raw->'creative'->>'id') AS creative_id,
      a.raw->'creative'->>'thumbnail_url' AS thumbnail_url,
      CASE
        WHEN nullif(a.raw->'creative'->>'instagram_permalink_url','') IS NOT NULL
          THEN a.raw->'creative'->>'instagram_permalink_url'
        WHEN nullif(a.raw->'creative'->>'effective_object_story_id','') IS NOT NULL
             AND split_part(a.raw->'creative'->>'effective_object_story_id','_',2) <> ''
          THEN 'https://www.facebook.com/'
               || split_part(a.raw->'creative'->>'effective_object_story_id','_',1)
               || '/posts/'
               || split_part(a.raw->'creative'->>'effective_object_story_id','_',2)
        ELSE NULL
      END AS permalink,
      coalesce(i.spend_7d,0) AS spend_7d,
      coalesce(i.impressions_7d,0)::bigint AS impressions_7d,
      coalesce(i.clicks_7d,0)::bigint AS clicks_7d,
      coalesce(i.v3s_7d,0)::bigint AS video_3s_views_7d,
      coalesce(i.thru_7d,0)::bigint AS thruplays_7d,
      coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d,
      coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      coalesce(i.v3s_30d,0)::bigint AS video_3s_views_30d,
      coalesce(i.thru_30d,0)::bigint AS thruplays_30d,
      ms.linked_song_id AS linked_song_id,
      a.last_synced_at AS last_synced_at
    FROM conns c
    JOIN crm.meta_ad_snapshot a ON a.connection_id = c.id
    LEFT JOIN crm.meta_adset_snapshot asn
      ON asn.connection_id = c.id AND asn.external_adset_id = a.external_adset_id
    LEFT JOIN crm.meta_campaign_snapshot ms
      ON ms.connection_id = c.id AND ms.external_campaign_id = a.external_campaign_id
    LEFT JOIN ins i ON i.connection_id = c.id AND i.external_ad_id = a.external_ad_id
    WHERE upper(coalesce(a.effective_status, a.status, '')) NOT IN ('DELETED','ARCHIVED')
      AND (p_campaign_id IS NULL OR a.external_campaign_id = p_campaign_id)
  )
  SELECT b.platform, b.connection_id, b.currency,
    b.campaign_id, b.campaign_name, b.adset_id, b.adset_name,
    b.ad_id, b.ad_name, b.status,
    b.creative_id, b.thumbnail_url, b.permalink,
    b.spend_7d, b.impressions_7d, b.clicks_7d,
    CASE WHEN b.impressions_7d > 0 THEN round(b.clicks_7d::numeric / b.impressions_7d, 6) END,
    CASE WHEN b.clicks_7d > 0 THEN round(b.spend_7d / b.clicks_7d, 4) END,
    b.video_3s_views_7d, b.thruplays_7d,
    CASE WHEN b.thruplays_7d > 0 THEN round(b.spend_7d / b.thruplays_7d, 4) END,
    b.spend_30d, b.impressions_30d, b.clicks_30d,
    CASE WHEN b.impressions_30d > 0 THEN round(b.clicks_30d::numeric / b.impressions_30d, 6) END,
    CASE WHEN b.clicks_30d > 0 THEN round(b.spend_30d / b.clicks_30d, 4) END,
    b.video_3s_views_30d, b.thruplays_30d,
    CASE WHEN b.thruplays_30d > 0 THEN round(b.spend_30d / b.thruplays_30d, 4) END,
    b.linked_song_id, b.last_synced_at
  FROM base b
  ORDER BY b.spend_30d DESC, b.ad_name NULLS LAST
$function$;

GRANT EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text) TO service_role;
SET lock_timeout = '5s';
BEGIN;
DROP FUNCTION IF EXISTS public.artist_ads_ads(uuid, text);

CREATE OR REPLACE FUNCTION public.artist_ads_ads(p_artist_id uuid, p_campaign_id text DEFAULT NULL::text, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(platform text, connection_id uuid, currency text, campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text, status text, creative_id text, thumbnail_url text, permalink text, spend_7d numeric, impressions_7d bigint, clicks_7d bigint, ctr_7d numeric, cpc_7d numeric, video_3s_views_7d bigint, thruplays_7d bigint, cost_per_thruplay_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, ctr_30d numeric, cpc_30d numeric, video_3s_views_30d bigint, thruplays_30d bigint, cost_per_thruplay_30d numeric, linked_song_id uuid, last_synced_at timestamp with time zone, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  plat AS (SELECT lower(coalesce(p_platform,'meta')) AS p),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g, plat
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'meta' AND plat.p = 'meta'
  ),
  ins AS (
    SELECT i.connection_id, i.external_ad_id,
      (array_agg(i.external_adset_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_adset_id,'') IS NOT NULL))[1] AS external_adset_id,
      (array_agg(i.external_campaign_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_campaign_id,'') IS NOT NULL))[1] AS external_campaign_id,
      (array_agg(i.ad_name ORDER BY i.date_start DESC) FILTER (WHERE i.ad_name IS NOT NULL))[1] AS ad_name,
      (array_agg(i.adset_name ORDER BY i.date_start DESC) FILTER (WHERE i.adset_name IS NOT NULL))[1] AS adset_name,
      (array_agg(i.campaign_name ORDER BY i.date_start DESC) FILTER (WHERE i.campaign_name IS NOT NULL))[1] AS campaign_name,
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
    FROM crm.meta_ad_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE i.date_start >= current_date - 29
    GROUP BY 1,2
  ),
  keys AS (
    SELECT i.connection_id, i.external_ad_id FROM ins i
    UNION
    SELECT a.connection_id, a.external_ad_id
    FROM crm.meta_ad_snapshot a JOIN conns c ON c.id = a.connection_id
  ),
  base AS (
    SELECT
      'meta'::text AS platform,
      c.id AS connection_id,
      coalesce(i.currency, ms.currency, c.selected_ad_account_currency) AS currency,
      coalesce(a.external_campaign_id, i.external_campaign_id) AS campaign_id,
      coalesce(ms.name, a.raw->>'campaign_name', i.campaign_name) AS campaign_name,
      coalesce(nullif(a.external_adset_id,''), i.external_adset_id) AS adset_id,
      coalesce(asn.name, i.adset_name) AS adset_name,
      k.external_ad_id AS ad_id,
      coalesce(a.name, i.ad_name) AS ad_name,
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
      a.last_synced_at AS last_synced_at,
      i.spend_7d_ref AS spend_7d_ref,
      i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days
    FROM keys k
    JOIN conns c ON c.id = k.connection_id
    LEFT JOIN ins i ON i.connection_id = k.connection_id AND i.external_ad_id = k.external_ad_id
    LEFT JOIN crm.meta_ad_snapshot a
      ON a.connection_id = k.connection_id AND a.external_ad_id = k.external_ad_id
    LEFT JOIN crm.meta_adset_snapshot asn
      ON asn.connection_id = c.id AND asn.external_adset_id = coalesce(nullif(a.external_adset_id,''), i.external_adset_id)
    LEFT JOIN crm.meta_campaign_snapshot ms
      ON ms.connection_id = c.id AND ms.external_campaign_id = coalesce(a.external_campaign_id, i.external_campaign_id)
    WHERE (upper(coalesce(a.effective_status, a.status, '')) NOT IN ('DELETED','ARCHIVED')
           OR coalesce(i.spend_30d,0) > 0)
      AND (p_campaign_id IS NULL OR coalesce(a.external_campaign_id, i.external_campaign_id) = p_campaign_id)
  ),
  conns_g AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g, plat
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'google' AND plat.p = 'google'
  ),
  ins_g AS (
    SELECT i.connection_id, i.external_ad_id,
      (array_agg(i.external_adset_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_adset_id,'') IS NOT NULL))[1] AS external_ad_group_id,
      (array_agg(i.external_campaign_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_campaign_id,'') IS NOT NULL))[1] AS external_campaign_id,
      (array_agg(i.campaign_name ORDER BY i.date_start DESC) FILTER (WHERE i.campaign_name IS NOT NULL))[1] AS campaign_name,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      max(i.last_synced_at) AS last_synced_at,
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
    FROM crm.ads_insights_breakdown_daily i
    JOIN conns_g c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE i.platform = 'google' AND i.level = 'ad' AND i.breakdown = 'none'
      AND i.date_start >= current_date - 29
    GROUP BY 1,2
  ),
  keys_g AS (
    SELECT i.connection_id, i.external_ad_id FROM ins_g i
    UNION
    SELECT a.connection_id, a.external_ad_id
    FROM crm.google_ad a JOIN conns_g c ON c.id = a.connection_id
  ),
  base_g AS (
    SELECT
      'google'::text AS platform,
      c.id AS connection_id,
      coalesce(i.currency, c.selected_ad_account_currency) AS currency,
      coalesce(a.external_campaign_id, i.external_campaign_id) AS campaign_id,
      coalesce(gc.name, i.campaign_name) AS campaign_name,
      coalesce(nullif(a.external_ad_group_id,''), i.external_ad_group_id) AS adset_id,
      gg.name AS adset_name,
      k.external_ad_id AS ad_id,
      coalesce(a.name, a.youtube_video_title) AS ad_name,
      a.status AS status,
      a.youtube_video_id AS creative_id,
      CASE WHEN nullif(a.youtube_video_id,'') IS NOT NULL
           THEN 'https://i.ytimg.com/vi/' || a.youtube_video_id || '/hqdefault.jpg' END AS thumbnail_url,
      CASE WHEN nullif(a.youtube_video_id,'') IS NOT NULL
           THEN 'https://www.youtube.com/watch?v=' || a.youtube_video_id END AS permalink,
      coalesce(i.spend_7d,0) AS spend_7d,
      coalesce(i.impressions_7d,0)::bigint AS impressions_7d,
      coalesce(i.clicks_7d,0)::bigint AS clicks_7d,
      NULL::bigint AS video_3s_views_7d,
      i.thru_7d::bigint AS thruplays_7d,
      coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d,
      coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      NULL::bigint AS video_3s_views_30d,
      i.thru_30d::bigint AS thruplays_30d,
      gc.linked_song_id AS linked_song_id,
      coalesce(a.last_synced_at, i.last_synced_at) AS last_synced_at,
      i.spend_7d_ref AS spend_7d_ref,
      i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days
    FROM keys_g k
    JOIN conns_g c ON c.id = k.connection_id
    LEFT JOIN ins_g i ON i.connection_id = k.connection_id AND i.external_ad_id = k.external_ad_id
    LEFT JOIN crm.google_ad a ON a.connection_id = k.connection_id AND a.external_ad_id = k.external_ad_id
    LEFT JOIN crm.google_ad_group gg
      ON gg.connection_id = c.id AND gg.external_ad_group_id = coalesce(nullif(a.external_ad_group_id,''), i.external_ad_group_id)
    LEFT JOIN crm.google_campaign gc
      ON gc.connection_id = c.id AND gc.external_campaign_id = coalesce(a.external_campaign_id, i.external_campaign_id)
    WHERE (upper(coalesce(a.status,'')) NOT IN ('REMOVED') OR coalesce(i.spend_30d,0) > 0)
      AND (p_campaign_id IS NULL OR coalesce(a.external_campaign_id, i.external_campaign_id) = p_campaign_id)
  ),
  todos AS (SELECT * FROM base UNION ALL SELECT * FROM base_g)
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
    b.linked_song_id, b.last_synced_at,
    (SELECT ref_currency FROM ref), b.spend_7d_ref, b.spend_30d_ref, b.fx_missing_days
  FROM todos b
  ORDER BY b.spend_30d DESC, b.ad_name NULLS LAST
$function$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text, text)
  TO authenticated, service_role, postgres, sandbox_exec_sfohvvlqccmmebvjgibx;
COMMIT;
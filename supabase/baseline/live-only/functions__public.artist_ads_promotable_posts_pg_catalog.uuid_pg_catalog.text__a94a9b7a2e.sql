-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_promotable_posts(pg_catalog.uuid,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "3237326a38e46de5c925549b95466e34eab348a888025b302e8c283449704c21", "live_properties_sha256": "6c80a7699365585eb1b112a2c8041cfee7756dea9c89b536a5823bb38a267971", "oid": 240012, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "23d0f5a98bf25eebc9f855c4d0129c3c16b9d77094f41072eb42562e8c04823e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 92e258e2ba5405027aab156a8b216af2607beb32c9d7ed8a16429b440be6d2aa
CREATE OR REPLACE FUNCTION public.artist_ads_promotable_posts(p_artist_id uuid, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(source text, platform text, post_ref text, post_kind text, permalink text, thumbnail_url text, caption_excerpt text, published_at timestamp with time zone, song_id uuid, meta_ready boolean, last_ad_name text, spend_30d_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');

  IF p_platform = 'tiktok' THEN
    RETURN QUERY
    SELECT 'artist_content'::text, 'tiktok'::text, ac.external_id, 'tiktok_video'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.external_id IS NOT NULL) AS meta_ready, NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'tiktok' AND ac.content_type = 'video' AND ac.external_id IS NOT NULL
    ORDER BY ac.published_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- YouTube (campanhas Google Ads de vídeo): o post_ref é o id do vídeo no YouTube (D-ERP108)
  IF p_platform IN ('google','youtube') THEN
    RETURN QUERY
    SELECT 'artist_content'::text, 'youtube'::text, ac.external_id, 'youtube_video'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.external_id ~ '^[A-Za-z0-9_-]{11}$') AS meta_ready, NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'youtube' AND ac.external_id IS NOT NULL
    ORDER BY ac.published_at DESC NULLS LAST;
    RETURN;
  END IF;

  IF p_platform IS DISTINCT FROM 'meta' THEN
    RAISE EXCEPTION 'plataforma não suportada' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH conns AS (
    SELECT c.id FROM crm.ad_platform_connections c
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = v_company AND c.platform = 'meta'
  ),
  ads AS (
    SELECT s.external_ad_id, s.name AS ad_name, s.updated_time,
           s.raw->'creative'->>'effective_object_story_id'     AS osi,
           s.raw->'creative'->>'effective_instagram_media_id'  AS igid,
           s.raw->'creative'->>'instagram_permalink_url'       AS permalink,
           s.raw->'creative'->>'thumbnail_url'                 AS thumb
    FROM crm.meta_ad_snapshot s
    JOIN conns c ON c.id = s.connection_id
  ),
  refs AS (
    SELECT *, coalesce(osi, igid) AS post_ref,
           CASE WHEN osi IS NOT NULL THEN 'object_story' ELSE 'instagram_media' END AS post_kind
    FROM ads WHERE coalesce(osi, igid) IS NOT NULL
  ),
  spend AS (
    SELECT i.external_ad_id, sum(i.spend_cents)::bigint AS sc
    FROM crm.meta_ad_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    WHERE i.date_start >= (current_date - 29)
    GROUP BY 1
  ),
  hist AS (
    SELECT DISTINCT ON (r.post_ref) r.post_ref, r.post_kind, r.permalink, r.thumb, r.ad_name
    FROM refs r ORDER BY r.post_ref, r.updated_time DESC NULLS LAST
  ),
  hist_spend AS (
    SELECT r.post_ref, sum(coalesce(sp.sc,0))::bigint AS sc
    FROM refs r LEFT JOIN spend sp ON sp.external_ad_id = r.external_ad_id GROUP BY 1
  ),
  hist_out AS (
    SELECT 'ad_history'::text AS source, 'meta'::text AS platform,
           h.post_ref, h.post_kind, h.permalink, h.thumb AS thumbnail_url,
           NULL::text AS caption_excerpt, NULL::timestamptz AS published_at,
           NULL::uuid AS song_id, true AS meta_ready,
           h.ad_name AS last_ad_name, coalesce(hs.sc,0)::bigint AS spend_30d_cents
    FROM hist h LEFT JOIN hist_spend hs ON hs.post_ref = h.post_ref
  ),
  content_out AS (
    SELECT 'artist_content'::text, 'meta'::text, ac.external_id, 'instagram_media'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.source = 'platform_api' AND ac.external_id ~ '^[0-9]{10,}$') AS meta_ready,
           NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'instagram' AND ac.external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hist_out h WHERE h.post_ref = ac.external_id)
  )
  SELECT * FROM hist_out UNION ALL SELECT * FROM content_out;
END $function$
;

ALTER FUNCTION public.artist_ads_promotable_posts(pg_catalog.uuid,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION 92e258e2ba5405027aab156a8b216af2607beb32c9d7ed8a16429b440be6d2aa

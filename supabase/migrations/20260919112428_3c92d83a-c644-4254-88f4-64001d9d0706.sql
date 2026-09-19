CREATE OR REPLACE FUNCTION public.artist_ads_promotable_posts(p_artist_id uuid)
RETURNS TABLE (
  source text, platform text, post_ref text, post_kind text,
  permalink text, thumbnail_url text, caption_excerpt text,
  published_at timestamptz, song_id uuid, meta_ready boolean,
  last_ad_name text, spend_30d_cents bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);

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
    SELECT DISTINCT ON (r.post_ref)
           r.post_ref, r.post_kind, r.permalink, r.thumb, r.ad_name
    FROM refs r
    ORDER BY r.post_ref, r.updated_time DESC NULLS LAST
  ),
  hist_spend AS (
    SELECT r.post_ref, sum(coalesce(sp.sc,0))::bigint AS sc
    FROM refs r LEFT JOIN spend sp ON sp.external_ad_id = r.external_ad_id
    GROUP BY 1
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
    SELECT 'artist_content'::text, 'meta'::text,
           ac.external_id, 'instagram_media'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at,
           ac.song_id,
           (ac.source = 'platform_api' AND ac.external_id ~ '^[0-9]{10,}$') AS meta_ready,
           NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'instagram'
      AND ac.external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hist_out h WHERE h.post_ref = ac.external_id)
  )
  SELECT * FROM hist_out
  UNION ALL
  SELECT * FROM content_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_promotable_posts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.artist_ads_promotable_posts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_promotable_posts(uuid) TO authenticated, service_role;

ALTER TABLE crm.meta_entity_actions_log
  DROP CONSTRAINT IF EXISTS meta_entity_actions_log_action_check;
ALTER TABLE crm.meta_entity_actions_log
  ADD CONSTRAINT meta_entity_actions_log_action_check
  CHECK (action = ANY (ARRAY['create','pause','activate','update_budget','update_name','update_end_time']));

UPDATE crm.ad_platform_connections
   SET selected_page_id = '385669081539715'
 WHERE id = 'e5d12c36-cd0f-412a-a1c0-22ddbb2a336e'
   AND selected_page_id IS NULL;
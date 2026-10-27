-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_creatives(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "ef411274ad1b05029ffcc8684a8103ae647c51d879f2605c3ce9b02f15188101", "live_properties_sha256": "84d152f7ac02636ef3e267ca857970b46f3ecef596c3218af9df144e161cc8e5", "oid": 240050, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4c3128e874cb22827b61293008f939d9a55227237e572577ced0bbac0e502df6", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION fd31bacfc8fabb4fb27215faa82d27f4f061024a9a43c045f81a29900e9d97a9
CREATE OR REPLACE FUNCTION public.artist_ads_creatives(p_artist_id uuid, p_connection_id uuid DEFAULT NULL::uuid, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(connection_id uuid, creative_id text, nome text, formato text, thumbnail_url text, permalink text, campanha_nome text, anuncio_nome text, estado text, gasto_30d_cents bigint, impressoes_30d bigint, cliques_30d bigint, thruplays_30d bigint, ultimo_uso timestamp with time zone, importado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');

  IF p_platform = 'tiktok' THEN
    RETURN QUERY
    SELECT c.id, ac.external_id, coalesce(ac.title, ac.caption_excerpt), 'video'::text,
           ac.thumbnail_url, ac.permalink, NULL::text, NULL::text, NULL::text,
           NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, ac.published_at,
           EXISTS (SELECT 1 FROM crm.meta_creatives mc
                    WHERE mc.company_id = v_company AND mc.analysis_jsonb->>'external_ref' = ac.external_id)
    FROM public.artist_content ac
    LEFT JOIN crm.ad_platform_connections c
           ON c.connection_scope = 'artist' AND c.artist_id = p_artist_id
          AND c.company_id = v_company AND c.platform = 'tiktok'
          AND (p_connection_id IS NULL OR c.id = p_connection_id)
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'tiktok' AND ac.content_type = 'video' AND ac.external_id IS NOT NULL
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
       AND (p_connection_id IS NULL OR c.id = p_connection_id)
  ),
  ads AS (
    SELECT s.connection_id, s.meta_creative_id, s.external_ad_id, s.name AS ad_name,
           cs.name AS campaign_name, s.effective_status, s.created_time,
           s.raw->'creative' AS cre,
           row_number() OVER (PARTITION BY s.meta_creative_id ORDER BY s.created_time DESC NULLS LAST) AS rn,
           max(s.created_time) OVER (PARTITION BY s.meta_creative_id) AS ultimo_uso
      FROM crm.meta_ad_snapshot s
      JOIN conns ON conns.id = s.connection_id
      LEFT JOIN crm.meta_campaign_snapshot cs
             ON cs.external_campaign_id = s.external_campaign_id AND cs.connection_id = s.connection_id
     WHERE s.meta_creative_id IS NOT NULL
  ),
  perf AS (
    SELECT a.meta_creative_id, sum(i.spend_cents)::bigint AS gasto, sum(i.impressions)::bigint AS imp,
           sum(i.clicks)::bigint AS clk, sum(i.video_thruplays)::bigint AS thru
      FROM crm.meta_ad_insights_daily i JOIN ads a ON a.external_ad_id = i.external_ad_id
     WHERE i.date_start >= current_date - 30 GROUP BY 1
  )
  SELECT a.connection_id, a.meta_creative_id, coalesce(a.cre->>'name', a.ad_name),
         CASE WHEN a.cre->>'video_id' IS NOT NULL THEN 'video'
              WHEN a.cre->>'image_url' IS NOT NULL THEN 'imagem'
              ELSE coalesce(lower(a.cre->>'object_type'), 'outro') END,
         a.cre->>'thumbnail_url', a.cre->>'instagram_permalink_url',
         a.campaign_name, a.ad_name, a.effective_status,
         p.gasto, p.imp, p.clk, p.thru, a.ultimo_uso,
         EXISTS (SELECT 1 FROM crm.meta_creatives mc WHERE mc.meta_creative_id = a.meta_creative_id)
    FROM ads a LEFT JOIN perf p ON p.meta_creative_id = a.meta_creative_id
   WHERE a.rn = 1
   ORDER BY p.gasto DESC NULLS LAST, a.ultimo_uso DESC NULLS LAST;
END $function$
;

ALTER FUNCTION public.artist_ads_creatives(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION fd31bacfc8fabb4fb27215faa82d27f4f061024a9a43c045f81a29900e9d97a9

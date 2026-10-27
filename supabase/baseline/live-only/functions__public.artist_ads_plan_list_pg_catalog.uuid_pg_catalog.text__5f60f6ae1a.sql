-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_plan_list(pg_catalog.uuid,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "0240c2fa4052d26fd0eb2946c634c57fa2d36c949c18d739a1750957026690bb", "live_properties_sha256": "945d3394f7f4d6234ce3dad389e4fe02527283b5bfe2250c27a38e2ced8ff869", "oid": 239760, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "8468bf2d2bc9c28afb03fee0439643e5e363827ac0872dc8aefa09eb769ca2c7", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d7846da91b60377bd9c2a5e31881c8e48e2172d68580b301a9b3958550eb50b0
CREATE OR REPLACE FUNCTION public.artist_ads_plan_list(p_artist_id uuid, p_platform text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, platform text, song_id uuid, song_title text, objetivo text, orcamento_total_cents bigint, moeda text, estado text, start_time timestamp with time zone, end_time timestamp with time zone, created_at timestamp with time zone, external_campaign_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');
  RETURN QUERY
  SELECT p.id, p.platform, p.song_id, s.title,
         p.objetivo, p.orcamento_total_cents, p.moeda, p.estado,
         p.start_time, p.end_time, p.created_at,
         COALESCE(p.external_campaign_id, p.meta_campaign_id)
  FROM crm.meta_publish_plan p
  LEFT JOIN public.artist_songs s ON s.id = p.song_id
  WHERE p.artist_id = p_artist_id
    AND p.song_id IS NOT NULL
    AND p.company_id = v_company
    AND (p_platform IS NULL OR p.platform = p_platform)
  ORDER BY p.created_at DESC;
END $function$
;

ALTER FUNCTION public.artist_ads_plan_list(pg_catalog.uuid,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION d7846da91b60377bd9c2a5e31881c8e48e2172d68580b301a9b3958550eb50b0

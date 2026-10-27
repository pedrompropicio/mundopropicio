-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_audience_set_manual(pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.date,pg_catalog.jsonb,pg_catalog.text,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e547814d27ea4569bef86dac5f5e98b3a05e97ac98c36b2cc5cdc1cbfb3a60b2", "live_properties_sha256": "2e904e6480d1342801efd4ec8b0011e92f1da07d05a29060a8ea8ff69ecd7cf1", "oid": 240126, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "a1bdedec06bf1bb68d5909745c84579ca77418ca5aad8f6268a267713e953f61", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 45dafd2948c0b5182305588249afdd69a06eb3148b6f1f11a3bcaf45eac77f02
CREATE OR REPLACE FUNCTION public.artist_audience_set_manual(p_artist_id uuid, p_platform text, p_audience_type text, p_dimension text, p_snapshot_date date, p_rows jsonb, p_timeframe text DEFAULT 'manual'::text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_n integer := 0; v_bad text;
BEGIN
  IF p_platform NOT IN ('tiktok','instagram','youtube','spotify','deezer','apple-music','other') THEN RAISE EXCEPTION 'plataforma inválida: %', p_platform; END IF;
  IF p_audience_type NOT IN ('followers','engaged','reached','listeners') THEN RAISE EXCEPTION 'audience_type inválido: %', p_audience_type; END IF;
  IF p_dimension NOT IN ('age','gender','city','country') THEN RAISE EXCEPTION 'dimensão inválida: %', p_dimension; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'p_rows tem de ser um array não vazio'; END IF;
  SELECT COALESCE(r->>'unit','count') INTO v_bad
    FROM jsonb_array_elements(p_rows) AS r
   WHERE COALESCE(r->>'unit','count') NOT IN ('count','pct')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'unit inválida: % (aceita count ou pct)', v_bad; END IF;
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'artista não encontrado'; END IF;
  -- D-ERP168: papel na empresa do artista (não na empresa ativa).
  IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão para registar demografia manual';
  END IF;
  INSERT INTO public.artist_audience_demographics (company_id, artist_id, platform, audience_type, dimension, dim_key, value, unit, timeframe, snapshot_date, source)
  SELECT v_company, p_artist_id, p_platform, p_audience_type, p_dimension, r->>'dim_key', (r->>'value')::numeric, COALESCE(r->>'unit','count'), p_timeframe, p_snapshot_date, 'manual'
  FROM jsonb_array_elements(p_rows) AS r
  WHERE COALESCE(r->>'dim_key','') <> '' AND (r->>'value') IS NOT NULL
  ON CONFLICT (artist_id, platform, audience_type, dimension, dim_key, snapshot_date, song_id)
  DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, timeframe = EXCLUDED.timeframe, source = 'manual';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.system_audit_log (company_id, entity_type, entity_id, action, changed_by, metadata)
  VALUES (v_company, 'artist_audience', p_artist_id::text, 'demographics_manual', COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object('platform', p_platform, 'audience_type', p_audience_type, 'dimension', p_dimension, 'snapshot_date', p_snapshot_date, 'linhas', v_n, 'note', p_note));
  RETURN v_n;
END; $function$
;

ALTER FUNCTION public.artist_audience_set_manual(pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.date,pg_catalog.jsonb,pg_catalog.text,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION 45dafd2948c0b5182305588249afdd69a06eb3148b6f1f11a3bcaf45eac77f02

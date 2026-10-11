-- D-ERP249: ligação automática Meta campanha→evento segura.
CREATE OR REPLACE FUNCTION crm.meta_campaign_years(p_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog' AS $$
  SELECT coalesce(array_agg(DISTINCT m[2]), '{}')
  FROM regexp_matches(coalesce(p_name,''), '(^|[^0-9])(20[0-9]{2})(?=[^0-9]|$)', 'g') m
$$;

-- Pontuação de um par campanha/evento: NULL = não liga; senão nº de tokens distintos do evento.
CREATE OR REPLACE FUNCTION crm.meta_campaign_event_score(p_campaign text, p_event text)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public', 'extensions' AS $$
  WITH ev AS (SELECT public.tiktok_event_distinct_tokens(p_event) t, crm.meta_campaign_years(p_event) y),
       ca AS (SELECT regexp_split_to_array(regexp_replace(lower(extensions.unaccent(coalesce(p_campaign,''))), '[^a-z0-9]+', ' ', 'g'), ' ') t,
                     crm.meta_campaign_years(p_campaign) y)
  SELECT CASE
    WHEN cardinality(ev.t) = 0 THEN NULL
    WHEN NOT (ev.t <@ ca.t) THEN NULL
    WHEN cardinality(ev.y) > 0 AND cardinality(ca.y) > 0 AND NOT (ev.y && ca.y) THEN NULL
    ELSE cardinality(ev.t) END
  FROM ev, ca
$$;

DROP FUNCTION IF EXISTS public.crm_auto_link_meta_campaigns_to_events(uuid);
DROP FUNCTION IF EXISTS crm.auto_link_meta_campaigns_to_events(uuid);
DROP FUNCTION IF EXISTS crm.auto_link_meta_campaigns_to_events__impl(uuid);

CREATE FUNCTION crm.auto_link_meta_campaigns_to_events__impl(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer, ambiguous jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'crm', 'public', 'extensions' AS $function$
DECLARE v_updated int := 0; v_total int; v_amb jsonb;
BEGIN
  CREATE TEMP TABLE _al ON COMMIT DROP AS
  WITH cand AS (
    SELECT mcs.id AS campaign_id, mcs.name AS campaign_name, e.id AS event_id, e.name AS event_name,
           crm.meta_campaign_event_score(mcs.name, e.name) AS score
    FROM crm.meta_campaign_snapshot mcs
    JOIN public.events e ON e.company_id = p_company_id AND e.status = 'active'
    WHERE mcs.company_id = p_company_id
      AND mcs.linked_event_id IS NULL
      AND mcs.linked_song_id IS NULL
      AND NOT coalesce(mcs.linked_event_locked, false)
      AND (mcs.effective_status = 'ACTIVE' OR mcs.created_time >= e.created_at)
  ), scored AS (
    SELECT *, max(score) OVER (PARTITION BY campaign_id) AS best FROM cand WHERE score IS NOT NULL
  )
  SELECT campaign_id, campaign_name, event_id, event_name,
         count(*) OVER (PARTITION BY campaign_id) AS n
  FROM scored WHERE score = best;

  UPDATE crm.meta_campaign_snapshot mcs SET linked_event_id = a.event_id
  FROM _al a WHERE a.n = 1 AND mcs.id = a.campaign_id AND mcs.linked_event_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT coalesce(jsonb_agg(jsonb_build_object('campaign_id', campaign_id, 'campaign_name', campaign_name, 'events', evs)), '[]')
    INTO v_amb
  FROM (SELECT campaign_id, campaign_name, jsonb_agg(jsonb_build_object('id', event_id, 'name', event_name)) evs
        FROM _al WHERE n > 1 GROUP BY 1, 2) x;

  SELECT count(*) INTO v_total FROM crm.meta_campaign_snapshot
  WHERE company_id = p_company_id AND status = 'ACTIVE';
  DROP TABLE IF EXISTS _al;
  RETURN QUERY SELECT v_updated, v_total, v_amb;
END; $function$;

CREATE FUNCTION crm.auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer, ambiguous jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm', 'extensions' AS $function$
BEGIN
  PERFORM public._assert_row_company(p_company_id, 'auto_link_meta_campaigns_to_events');
  RETURN QUERY SELECT * FROM crm.auto_link_meta_campaigns_to_events__impl(p_company_id);
END; $function$;

CREATE FUNCTION public.crm_auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer, ambiguous jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'crm', 'extensions' AS $function$
  SELECT * FROM crm.auto_link_meta_campaigns_to_events(p_company_id);
$function$;

REVOKE ALL ON FUNCTION crm.auto_link_meta_campaigns_to_events__impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.auto_link_meta_campaigns_to_events__impl(uuid) TO service_role;
REVOKE ALL ON FUNCTION crm.auto_link_meta_campaigns_to_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm.auto_link_meta_campaigns_to_events(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION crm.meta_campaign_years(text), crm.meta_campaign_event_score(text, text) TO authenticated, service_role;
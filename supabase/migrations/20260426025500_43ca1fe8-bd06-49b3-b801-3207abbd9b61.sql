DROP FUNCTION IF EXISTS public.list_bp_versions(uuid);

CREATE OR REPLACE FUNCTION public.list_bp_versions(_event_id uuid)
RETURNS TABLE(
  id uuid,
  version_number integer,
  state text,
  scenario_label text,
  scenario_assumptions jsonb,
  is_pinned_scenario boolean,
  description text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  superseded_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_by uuid,
  created_by_label text,
  cascaded_from_version_id uuid,
  is_retroactive_snapshot boolean,
  forecast_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    v.id,
    v.version_number,
    v.state,
    v.scenario_label,
    v.scenario_assumptions,
    v.is_pinned_scenario,
    v.description,
    v.created_at,
    v.approved_at,
    v.superseded_at,
    v.archived_at,
    v.created_by,
    v.created_by_label,
    v.cascaded_from_version_id,
    v.is_retroactive_snapshot,
    COALESCE(jsonb_array_length(v.snapshot_payload->'forecasts'), 0) AS forecast_count
  FROM public.bp_versions v
  WHERE v.event_id = _event_id
  ORDER BY v.version_number DESC;
$function$;
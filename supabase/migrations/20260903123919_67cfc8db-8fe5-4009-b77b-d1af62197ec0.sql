CREATE OR REPLACE FUNCTION public.zone_capacity_snapshot(_event_id uuid, _on date DEFAULT CURRENT_DATE)
 RETURNS TABLE(zone_id uuid, zone_name text, capacity numeric, available numeric, blocked numeric, occupied numeric, observed_on date, source text, unmatched_labels jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND public.row_belongs_to_current_company(e.company_id)
  ) INTO v_ok;
  IF NOT v_ok THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH snap AS (
    SELECT max(ezc.observed_on) AS d
    FROM public.event_zone_capacities ezc
    WHERE ezc.event_id = _event_id
      AND ezc.observed_on IS NOT NULL
      AND ezc.observed_on <= _on
  ),
  src AS (
    SELECT ezc.*, public.normalize_zone_label(ezc.zone_label) AS norm
    FROM public.event_zone_capacities ezc
    JOIN snap s ON ezc.observed_on = s.d
    WHERE ezc.event_id = _event_id
  ),
  zones AS (
    SELECT z.id, z.name, public.normalize_zone_label(z.name) AS norm
    FROM public.event_ticket_zones z
    WHERE z.event_id = _event_id
  ),
  matched AS (
    SELECT src.*, z.id AS zid, z.name AS zname
    FROM src
    LEFT JOIN zones z ON z.norm = src.norm
  ),
  unmatched AS (
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object(
        'zone_label', m.zone_label,
        'capacity', m.capacity,
        'available', m.available,
        'blocked', m.blocked,
        'occupied', m.occupied,
        'source', m.source
      )), '[]'::jsonb) AS labels
    FROM matched m
    WHERE m.zid IS NULL
  ),
  agg AS (
    SELECT
      m.zid AS zone_id,
      m.zname AS zone_name,
      sum(coalesce(m.capacity, 0))::numeric AS capacity,
      sum(coalesce(m.available, 0))::numeric AS available,
      sum(coalesce(m.blocked, 0))::numeric AS blocked,
      sum(coalesce(m.occupied, 0))::numeric AS occupied,
      max(m.observed_on) AS observed_on,
      max(m.source) AS source
    FROM matched m
    WHERE m.zid IS NOT NULL
    GROUP BY m.zid, m.zname
  )
  SELECT a.zone_id, a.zone_name, a.capacity, a.available, a.blocked, a.occupied,
         a.observed_on, a.source, (SELECT labels FROM unmatched)
  FROM agg a
  UNION ALL
  -- Sem nenhuma zona casada: devolve uma linha sem zona só para não perder os
  -- rótulos não casados (a UI mostra-os em vez de os esconder).
  SELECT NULL::uuid, NULL::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
         (SELECT d FROM snap), NULL::text, (SELECT labels FROM unmatched)
  WHERE NOT EXISTS (SELECT 1 FROM agg)
    AND (SELECT labels FROM unmatched) <> '[]'::jsonb
  ORDER BY 2;
END;
$function$;
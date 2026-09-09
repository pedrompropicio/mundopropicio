DROP FUNCTION IF EXISTS public.get_event_capacity_quality();

CREATE OR REPLACE FUNCTION public.get_event_capacity_quality()
RETURNS TABLE(
  group_id uuid,
  capacity bigint,
  available bigint,
  occupied bigint,
  blocked bigint,
  zones integer,
  zones_oversold integer,
  last_observed date,
  stale boolean,
  trustworthy boolean,
  issue text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
WITH ref AS (
  SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date AS today
),
ev AS (
  SELECT e.id, COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
latest AS (
  SELECT DISTINCT ON (c.event_id, c.zone_label)
         c.event_id, c.zone_label, c.capacity, c.available, c.occupied, c.blocked, c.observed_on
  FROM public.event_zone_capacities c
  WHERE c.capacity_kind = 'released'
  ORDER BY c.event_id, c.zone_label, c.observed_on DESC, c.updated_at DESC NULLS LAST
),
agg AS (
  SELECT ev.gid,
         COALESCE(SUM(l.capacity), 0)::bigint  AS capacity,
         COALESCE(SUM(l.available), 0)::bigint AS available,
         COALESCE(SUM(l.occupied), 0)::bigint  AS occupied,
         COALESCE(SUM(l.blocked), 0)::bigint   AS blocked,
         COUNT(l.zone_label)::int              AS zones,
         COUNT(*) FILTER (WHERE l.occupied IS NOT NULL AND l.capacity IS NOT NULL AND l.occupied > l.capacity)::int AS zones_oversold,
         MAX(l.observed_on)                    AS last_observed
  FROM ev
  JOIN latest l ON l.event_id = ev.id
  GROUP BY ev.gid
),
f AS (
  SELECT a.*, (a.last_observed IS NULL OR a.last_observed < r.today - 2) AS stale
  FROM agg a CROSS JOIN ref r
)
SELECT f.gid AS group_id,
       f.capacity,
       f.available,
       f.occupied,
       f.blocked,
       f.zones,
       f.zones_oversold,
       f.last_observed,
       f.stale,
       (f.zones > 0 AND f.capacity > 0 AND NOT f.stale) AS trustworthy,
       CASE
         WHEN (f.zones > 0 AND f.capacity > 0 AND NOT f.stale) THEN NULL
         WHEN f.zones = 0 THEN 'sem observação de lotação da bilheteira'
         WHEN f.stale THEN 'última observação de ' || to_char(f.last_observed, 'DD/MM/YYYY')
         WHEN f.capacity = 0 THEN 'lotação a zero na última observação'
         ELSE 'sem observação de lotação da bilheteira'
       END AS issue
FROM f;
$function$;
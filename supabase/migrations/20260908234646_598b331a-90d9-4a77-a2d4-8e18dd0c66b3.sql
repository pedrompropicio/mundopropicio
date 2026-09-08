CREATE OR REPLACE FUNCTION public.get_event_capacity_quality()
 RETURNS TABLE(group_id uuid, capacity bigint, zones int, zones_no_capacity int, zones_sold_over_capacity int, zones_equals_sold int, trustworthy boolean, issue text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT e.id, COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
zone AS (
  SELECT ev.gid,
         z.id AS zone_id,
         z.total_capacity,
         COALESCE((SELECT SUM(ts.quantity) FROM public.ticket_sales ts WHERE ts.zone_id = z.id), 0)::bigint AS sold
  FROM public.event_ticket_zones z
  JOIN ev ON ev.id = z.event_id
),
agg AS (
  SELECT zone.gid,
         COALESCE(SUM(zone.total_capacity), 0)::bigint AS capacity,
         COUNT(*)::int AS zones,
         COUNT(*) FILTER (WHERE zone.total_capacity IS NULL)::int AS zones_no_capacity,
         COUNT(*) FILTER (WHERE zone.total_capacity IS NOT NULL AND zone.sold > zone.total_capacity)::int AS zones_sold_over_capacity,
         COUNT(*) FILTER (WHERE zone.total_capacity IS NOT NULL AND zone.sold = zone.total_capacity)::int AS zones_equals_sold
  FROM zone
  GROUP BY zone.gid
)
SELECT a.gid AS group_id,
       a.capacity,
       a.zones,
       a.zones_no_capacity,
       a.zones_sold_over_capacity,
       a.zones_equals_sold,
       (a.zones > 0 AND a.zones_no_capacity = 0 AND a.zones_sold_over_capacity = 0 AND NOT (a.zones_equals_sold = a.zones)) AS trustworthy,
       CASE
         WHEN a.zones > 0 AND a.zones_no_capacity = 0 AND a.zones_sold_over_capacity = 0 AND NOT (a.zones_equals_sold = a.zones) THEN NULL
         WHEN a.zones_no_capacity > 0 THEN 'sem lotação em ' || a.zones_no_capacity || ' zonas'
         WHEN a.zones_sold_over_capacity > 0 THEN 'vendido acima da lotação em ' || a.zones_sold_over_capacity || ' zonas'
         WHEN a.zones > 0 AND a.zones_equals_sold = a.zones THEN 'lotação igual ao vendido em todas as zonas — preenchida pelo import'
         ELSE 'sem zonas registadas'
       END AS issue
FROM agg a;
$function$;
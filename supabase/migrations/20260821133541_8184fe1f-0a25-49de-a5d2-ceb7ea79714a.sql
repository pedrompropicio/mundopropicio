CREATE OR REPLACE FUNCTION public.get_daily_sales_series(
  p_start date,
  p_end date,
  p_event_ids uuid[] DEFAULT NULL,
  p_provider text DEFAULT NULL
)
RETURNS TABLE(
  group_id uuid,
  event_name text,
  event_date date,
  sale_date date,
  provider text,
  qty bigint,
  value numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT e.id, e.name, e.date, e.status, e.parent_event_id,
         COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
grp AS (
  SELECT ev.gid,
         COALESCE(MAX(CASE WHEN ev.id = ev.gid THEN ev.name END), MIN(ev.name)) AS gname,
         MIN(ev.date) AS gdate
  FROM ev
  GROUP BY ev.gid
),
scoped AS (
  SELECT ev.id, ev.gid
  FROM ev
  WHERE p_event_ids IS NULL OR ev.gid = ANY(p_event_ids) OR ev.id = ANY(p_event_ids)
),
bol_ev AS (
  SELECT c.event_id
  FROM public.bol_sync_config c
  GROUP BY c.event_id
  HAVING bool_or(COALESCE(c.enabled, false))
),
ts_rows AS (
  SELECT s.gid,
         ts.sale_date,
         CASE
           WHEN ts.source = 'ticketline_import' THEN 'Ticketline'
           WHEN ts.source = 'bol' THEN 'BOL'
           WHEN ts.source = 'fever_import' THEN 'Fever'
           ELSE 'Outras'
         END AS provider,
         SUM(ts.quantity)::bigint AS qty,
         SUM(COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0))::numeric AS value
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  JOIN scoped s ON s.id = z.event_id
  WHERE ts.sale_date BETWEEN p_start AND p_end
    AND z.event_id NOT IN (SELECT event_id FROM bol_ev)
  GROUP BY 1, 2, 3
),
bol_rows AS (
  SELECT s.gid,
         d.sale_date,
         'BOL'::text AS provider,
         SUM(d.quantity)::bigint AS qty,
         SUM(COALESCE(d.total_value, 0))::numeric AS value
  FROM public.bol_daily_sales d
  JOIN scoped s ON s.id = d.event_id
  WHERE d.sale_date BETWEEN p_start AND p_end
    AND d.event_id IN (SELECT event_id FROM bol_ev)
  GROUP BY 1, 2, 3
),
allr AS (
  SELECT * FROM ts_rows
  UNION ALL
  SELECT * FROM bol_rows
)
SELECT a.gid AS group_id,
       g.gname AS event_name,
       g.gdate AS event_date,
       a.sale_date,
       a.provider,
       SUM(a.qty)::bigint AS qty,
       SUM(a.value)::numeric AS value
FROM allr a
JOIN grp g ON g.gid = a.gid
WHERE p_provider IS NULL OR a.provider = p_provider
GROUP BY 1, 2, 3, 4, 5
HAVING SUM(a.qty) <> 0 OR SUM(a.value) <> 0
ORDER BY 2, 4, 5;
$function$;

GRANT EXECUTE ON FUNCTION public.get_daily_sales_series(date, date, uuid[], text) TO authenticated;
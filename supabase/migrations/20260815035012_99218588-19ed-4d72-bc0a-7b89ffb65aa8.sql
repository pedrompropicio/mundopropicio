CREATE OR REPLACE FUNCTION public.get_sales_position()
 RETURNS TABLE(group_id uuid, event_name text, event_date date, child_count integer, total_qty bigint, total_value numeric, last7_qty bigint, last7_value numeric, yesterday_qty bigint, yesterday_value numeric, has_bol boolean, daily_missing boolean)
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
sales AS (
  SELECT z.event_id,
         SUM(ts.quantity)::bigint AS qty,
         SUM(ts.total_value)::numeric AS val,
         SUM(CASE WHEN ts.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN ts.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN ts.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN ts.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN ts.sale_date = current_date - 1 THEN ts.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN ts.sale_date = current_date - 1 THEN ts.total_value ELSE 0 END)::numeric AS vy,
         MAX(ts.sale_date) AS last_sale
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  GROUP BY z.event_id
),
bol AS (
  SELECT c.event_id, bool_or(COALESCE(c.enabled, false)) AS active
  FROM public.bol_sync_config c
  GROUP BY c.event_id
),
daily AS (
  SELECT d.event_id,
         COUNT(*)::bigint AS n,
         SUM(CASE WHEN d.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN d.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN d.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN d.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN d.sale_date = current_date - 1 THEN d.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN d.sale_date = current_date - 1 THEN d.total_value ELSE 0 END)::numeric AS vy
  FROM public.bol_daily_sales d
  GROUP BY d.event_id
),
per AS (
  SELECT ev.gid, ev.id, ev.name, ev.date, ev.status, ev.parent_event_id,
         COALESCE(s.qty, 0) AS tq,
         COALESCE(s.val, 0) AS tv,
         COALESCE(b.active, false) AS is_bol,
         (d.n IS NOT NULL) AS has_daily,
         s.last_sale,
         CASE WHEN COALESCE(b.active, false) THEN COALESCE(d.q7, 0) ELSE COALESCE(s.q7, 0) END AS w7q,
         CASE WHEN COALESCE(b.active, false) THEN COALESCE(d.v7, 0) ELSE COALESCE(s.v7, 0) END AS w7v,
         CASE WHEN COALESCE(b.active, false) THEN COALESCE(d.qy, 0) ELSE COALESCE(s.qy, 0) END AS wyq,
         CASE WHEN COALESCE(b.active, false) THEN COALESCE(d.vy, 0) ELSE COALESCE(s.vy, 0) END AS wyv
  FROM ev
  LEFT JOIN sales s ON s.event_id = ev.id
  LEFT JOIN bol b ON b.event_id = ev.id
  LEFT JOIN daily d ON d.event_id = ev.id
),
keep AS (
  SELECT gid, MIN(date) AS next_date
  FROM per
  WHERE date >= current_date
    AND COALESCE(status, '') NOT IN ('cancelled', 'completed', 'archived')
  GROUP BY gid
)
SELECT p.gid AS group_id,
       COALESCE(MAX(CASE WHEN p.id = p.gid THEN p.name END), MIN(p.name)) AS event_name,
       MIN(k.next_date) AS event_date,
       COUNT(*) FILTER (WHERE p.parent_event_id IS NOT NULL)::integer AS child_count,
       SUM(p.tq)::bigint AS total_qty,
       SUM(p.tv)::numeric AS total_value,
       SUM(p.w7q)::bigint AS last7_qty,
       SUM(p.w7v)::numeric AS last7_value,
       SUM(p.wyq)::bigint AS yesterday_qty,
       SUM(p.wyv)::numeric AS yesterday_value,
       bool_or(p.is_bol) AS has_bol,
       bool_or(p.is_bol AND NOT p.has_daily) AS daily_missing
FROM per p
JOIN keep k ON k.gid = p.gid
GROUP BY p.gid
ORDER BY 3 ASC NULLS LAST;
$function$;
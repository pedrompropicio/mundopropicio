CREATE OR REPLACE FUNCTION public.get_sales_position_by_provider()
RETURNS TABLE(provider text, sort_order integer, total_qty bigint, total_value numeric, last7_qty bigint, last7_value numeric, yesterday_qty bigint, yesterday_value numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT e.id, e.date, e.status, COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
keep AS (
  SELECT DISTINCT gid FROM ev
  WHERE date >= current_date
    AND COALESCE(status, '') NOT IN ('cancelled', 'completed', 'archived')
),
scoped AS (
  SELECT ev.id FROM ev JOIN keep k ON k.gid = ev.gid
),
ts AS (
  SELECT CASE
           WHEN ts.source = 'ticketline_import' THEN 'Ticketline'
           WHEN ts.source = 'bol' THEN 'BOL'
           WHEN ts.source = 'fever_import' THEN 'Fever'
           ELSE 'Outras'
         END AS provider,
         SUM(ts.quantity)::bigint AS tq,
         SUM(ts.total_value)::numeric AS tv,
         SUM(CASE WHEN ts.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN ts.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN ts.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN ts.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN ts.sale_date = current_date - 1 THEN ts.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN ts.sale_date = current_date - 1 THEN ts.total_value ELSE 0 END)::numeric AS vy
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  JOIN scoped s ON s.id = z.event_id
  GROUP BY 1
),
bolw AS (
  SELECT SUM(CASE WHEN d.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN d.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN d.sale_date BETWEEN current_date - 7 AND current_date - 1 THEN d.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN d.sale_date = current_date - 1 THEN d.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN d.sale_date = current_date - 1 THEN d.total_value ELSE 0 END)::numeric AS vy
  FROM public.bol_daily_sales d
  JOIN scoped s ON s.id = d.event_id
)
SELECT ts.provider,
       CASE ts.provider WHEN 'Ticketline' THEN 1 WHEN 'BOL' THEN 2 WHEN 'Fever' THEN 3 ELSE 9 END AS sort_order,
       ts.tq AS total_qty,
       ts.tv AS total_value,
       CASE WHEN ts.provider = 'BOL' THEN COALESCE((SELECT q7 FROM bolw), 0) ELSE ts.q7 END AS last7_qty,
       CASE WHEN ts.provider = 'BOL' THEN COALESCE((SELECT v7 FROM bolw), 0) ELSE ts.v7 END AS last7_value,
       CASE WHEN ts.provider = 'BOL' THEN COALESCE((SELECT qy FROM bolw), 0) ELSE ts.qy END AS yesterday_qty,
       CASE WHEN ts.provider = 'BOL' THEN COALESCE((SELECT vy FROM bolw), 0) ELSE ts.vy END AS yesterday_value
FROM ts
WHERE COALESCE(ts.tq, 0) <> 0 OR COALESCE(ts.tv, 0) <> 0
ORDER BY 2, 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sales_position_by_provider() TO authenticated;
DROP FUNCTION IF EXISTS public.get_sales_position();
DROP FUNCTION IF EXISTS public.get_sales_position_by_provider();

CREATE OR REPLACE FUNCTION public.get_sales_position()
 RETURNS TABLE(group_id uuid, event_name text, event_date date, child_count integer, total_qty bigint, total_value numeric, last7_qty bigint, last7_value numeric, yesterday_qty bigint, yesterday_value numeric, today_qty bigint, today_value numeric, has_bol boolean, daily_missing boolean, fortnight_qty bigint, fortnight_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ref AS (
  SELECT d AS today,
         CASE WHEN EXTRACT(DAY FROM d) <= 15
              THEN date_trunc('month', d)::date
              ELSE date_trunc('month', d)::date + 15
         END AS fstart,
         CASE WHEN EXTRACT(DAY FROM d) <= 15
              THEN date_trunc('month', d)::date + 14
              ELSE (date_trunc('month', d)::date + INTERVAL '1 month')::date - 1
         END AS fend
  FROM (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date AS d) x
),
ev AS (
  SELECT e.id, e.name, e.date, e.status, e.parent_event_id,
         COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
sales AS (
  SELECT z.event_id,
         SUM(ts.quantity)::bigint AS qty,
         SUM(ts.total_value)::numeric AS val,
         SUM(CASE WHEN ts.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN ts.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN ts.sale_date BETWEEN r.fstart AND r.fend THEN ts.quantity ELSE 0 END)::bigint AS qf,
         SUM(CASE WHEN ts.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN ts.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN ts.sale_date BETWEEN r.fstart AND r.fend THEN ts.total_value ELSE 0 END)::numeric AS vf,
         SUM(CASE WHEN ts.sale_date = r.today - 1 THEN ts.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN ts.sale_date = r.today - 1 THEN ts.total_value ELSE 0 END)::numeric AS vy,
         SUM(CASE WHEN ts.sale_date = r.today THEN ts.quantity ELSE 0 END)::bigint AS qt,
         SUM(CASE WHEN ts.sale_date = r.today THEN ts.total_value ELSE 0 END)::numeric AS vt,
         MAX(ts.sale_date) AS last_sale
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  CROSS JOIN ref r
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
         SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.quantity ELSE 0 END)::bigint AS qf,
         SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.total_value ELSE 0 END)::numeric AS vf,
         SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.total_value ELSE 0 END)::numeric AS vy,
         SUM(CASE WHEN d.sale_date = r.today THEN d.quantity ELSE 0 END)::bigint AS qt,
         SUM(CASE WHEN d.sale_date = r.today THEN d.total_value ELSE 0 END)::numeric AS vt
  FROM public.bol_daily_sales d
  CROSS JOIN ref r
  GROUP BY d.event_id
),
tlfb AS (
  SELECT c.event_id
  FROM public.ticketline_sync_config c
  GROUP BY c.event_id
  HAVING bool_or(COALESCE(c.daily_fallback_active, false))
),
tld AS (
  SELECT d.event_id,
         COUNT(*)::bigint AS n,
         SUM(d.quantity)::bigint AS qty,
         SUM(d.total_value)::numeric AS val,
         SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.quantity ELSE 0 END)::bigint AS q7,
         SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.quantity ELSE 0 END)::bigint AS qf,
         SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.total_value ELSE 0 END)::numeric AS v7,
         SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.total_value ELSE 0 END)::numeric AS vf,
         SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.quantity ELSE 0 END)::bigint AS qy,
         SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.total_value ELSE 0 END)::numeric AS vy,
         SUM(CASE WHEN d.sale_date = r.today THEN d.quantity ELSE 0 END)::bigint AS qt,
         SUM(CASE WHEN d.sale_date = r.today THEN d.total_value ELSE 0 END)::numeric AS vt
  FROM public.ticketline_daily_sales d
  CROSS JOIN ref r
  GROUP BY d.event_id
),
per AS (
  SELECT ev.gid, ev.id, ev.name, ev.date, ev.status, ev.parent_event_id,
         (t.event_id IS NOT NULL) AS is_tlfb,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.qty, 0) ELSE COALESCE(s.qty, 0) END AS tq,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.val, 0) ELSE COALESCE(s.val, 0) END AS tv,
         COALESCE(b.active, false) AS is_bol,
         (d.n IS NOT NULL) AS has_daily,
         s.last_sale,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.q7, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.q7, 0) ELSE COALESCE(s.q7, 0) END AS w7q,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.v7, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.v7, 0) ELSE COALESCE(s.v7, 0) END AS w7v,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.qf, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.qf, 0) ELSE COALESCE(s.qf, 0) END AS wfq,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.vf, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.vf, 0) ELSE COALESCE(s.vf, 0) END AS wfv,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.qy, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.qy, 0) ELSE COALESCE(s.qy, 0) END AS wyq,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.vy, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.vy, 0) ELSE COALESCE(s.vy, 0) END AS wyv,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.qt, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.qt, 0) ELSE COALESCE(s.qt, 0) END AS wtq,
         CASE WHEN t.event_id IS NOT NULL THEN COALESCE(td.vt, 0)
              WHEN COALESCE(b.active, false) THEN COALESCE(d.vt, 0) ELSE COALESCE(s.vt, 0) END AS wtv
  FROM ev
  LEFT JOIN sales s ON s.event_id = ev.id
  LEFT JOIN bol b ON b.event_id = ev.id
  LEFT JOIN daily d ON d.event_id = ev.id
  LEFT JOIN tlfb t ON t.event_id = ev.id
  LEFT JOIN tld td ON td.event_id = ev.id
),
keep AS (
  SELECT per.gid, MIN(per.date) AS next_date
  FROM per
  CROSS JOIN ref r
  WHERE per.date >= r.today
    AND COALESCE(per.status, '') NOT IN ('cancelled', 'completed', 'archived')
  GROUP BY per.gid
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
       SUM(p.wtq)::bigint AS today_qty,
       SUM(p.wtv)::numeric AS today_value,
       bool_or(p.is_bol) AS has_bol,
       bool_or(p.is_bol AND NOT p.has_daily) AS daily_missing,
       SUM(p.wfq)::bigint AS fortnight_qty,
       SUM(p.wfv)::numeric AS fortnight_value
FROM per p
JOIN keep k ON k.gid = p.gid
GROUP BY p.gid
ORDER BY 3 ASC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_position_by_provider()
 RETURNS TABLE(provider text, sort_order integer, total_qty bigint, total_value numeric, last7_qty bigint, last7_value numeric, yesterday_qty bigint, yesterday_value numeric, today_qty bigint, today_value numeric, fortnight_qty bigint, fortnight_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ref AS (
  SELECT d AS today,
         CASE WHEN EXTRACT(DAY FROM d) <= 15
              THEN date_trunc('month', d)::date
              ELSE date_trunc('month', d)::date + 15
         END AS fstart,
         CASE WHEN EXTRACT(DAY FROM d) <= 15
              THEN date_trunc('month', d)::date + 14
              ELSE (date_trunc('month', d)::date + INTERVAL '1 month')::date - 1
         END AS fend
  FROM (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date AS d) x
),
ev AS (
  SELECT e.id, e.date, e.status, COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e
  WHERE COALESCE(e.management_type, 'own') = 'own'
),
keep AS (
  SELECT DISTINCT ev.gid FROM ev
  CROSS JOIN ref r
  WHERE ev.date >= r.today
    AND COALESCE(ev.status, '') NOT IN ('cancelled', 'completed', 'archived')
),
scoped AS (
  SELECT ev.id FROM ev JOIN keep k ON k.gid = ev.gid
),
tlfb AS (
  SELECT c.event_id
  FROM public.ticketline_sync_config c
  GROUP BY c.event_id
  HAVING bool_or(COALESCE(c.daily_fallback_active, false))
),
ts AS (
  SELECT CASE
           WHEN ts.source = 'ticketline_import' THEN 'Ticketline'
           WHEN ts.source = 'bol' THEN 'BOL'
           WHEN ts.source = 'fever_import' THEN 'Fever'
           ELSE 'Outras'
         END AS provider,
         COALESCE(SUM(ts.quantity),0)::bigint AS tq,
         COALESCE(SUM(COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0)),0)::numeric AS tv,
         COALESCE(SUM(CASE WHEN ts.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN ts.quantity ELSE 0 END),0)::bigint AS q7,
         COALESCE(SUM(CASE WHEN ts.sale_date BETWEEN r.fstart AND r.fend THEN ts.quantity ELSE 0 END),0)::bigint AS qf,
         COALESCE(SUM(CASE WHEN ts.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0) ELSE 0 END),0)::numeric AS v7,
         COALESCE(SUM(CASE WHEN ts.sale_date BETWEEN r.fstart AND r.fend THEN COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0) ELSE 0 END),0)::numeric AS vf,
         COALESCE(SUM(CASE WHEN ts.sale_date = r.today - 1 THEN ts.quantity ELSE 0 END),0)::bigint AS qy,
         COALESCE(SUM(CASE WHEN ts.sale_date = r.today - 1 THEN COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0) ELSE 0 END),0)::numeric AS vy,
         COALESCE(SUM(CASE WHEN ts.sale_date = r.today THEN ts.quantity ELSE 0 END),0)::bigint AS qt,
         COALESCE(SUM(CASE WHEN ts.sale_date = r.today THEN COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0) ELSE 0 END),0)::numeric AS vt
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  JOIN scoped s ON s.id = z.event_id
  CROSS JOIN ref r
  WHERE z.event_id NOT IN (SELECT event_id FROM tlfb)
  GROUP BY 1
),
tld AS (
  SELECT 'Ticketline'::text AS provider,
         COALESCE(SUM(d.quantity),0)::bigint AS tq,
         COALESCE(SUM(d.total_value),0)::numeric AS tv,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.quantity ELSE 0 END),0)::bigint AS q7,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.quantity ELSE 0 END),0)::bigint AS qf,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.total_value ELSE 0 END),0)::numeric AS v7,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.total_value ELSE 0 END),0)::numeric AS vf,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.quantity ELSE 0 END),0)::bigint AS qy,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.total_value ELSE 0 END),0)::numeric AS vy,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today THEN d.quantity ELSE 0 END),0)::bigint AS qt,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today THEN d.total_value ELSE 0 END),0)::numeric AS vt
  FROM public.ticketline_daily_sales d
  JOIN scoped s ON s.id = d.event_id
  JOIN tlfb t ON t.event_id = d.event_id
  CROSS JOIN ref r
),
unioned AS (
  SELECT provider, tq, tv, q7, v7, qf, vf, qy, vy, qt, vt FROM ts
  UNION ALL
  SELECT provider, tq, tv, q7, v7, qf, vf, qy, vy, qt, vt FROM tld
),
agg AS (
  SELECT provider,
         SUM(tq)::bigint AS tq, SUM(tv)::numeric AS tv,
         SUM(q7)::bigint AS q7, SUM(v7)::numeric AS v7,
         SUM(qf)::bigint AS qf, SUM(vf)::numeric AS vf,
         SUM(qy)::bigint AS qy, SUM(vy)::numeric AS vy,
         SUM(qt)::bigint AS qt, SUM(vt)::numeric AS vt
  FROM unioned
  GROUP BY 1
),
bolw AS (
  SELECT COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.quantity ELSE 0 END),0)::bigint AS q7,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.quantity ELSE 0 END),0)::bigint AS qf,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.today - 7 AND r.today - 1 THEN d.total_value ELSE 0 END),0)::numeric AS v7,
         COALESCE(SUM(CASE WHEN d.sale_date BETWEEN r.fstart AND r.fend THEN d.total_value ELSE 0 END),0)::numeric AS vf,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.quantity ELSE 0 END),0)::bigint AS qy,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today - 1 THEN d.total_value ELSE 0 END),0)::numeric AS vy,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today THEN d.quantity ELSE 0 END),0)::bigint AS qt,
         COALESCE(SUM(CASE WHEN d.sale_date = r.today THEN d.total_value ELSE 0 END),0)::numeric AS vt
  FROM public.bol_daily_sales d
  JOIN scoped s ON s.id = d.event_id
  CROSS JOIN ref r
)
SELECT a.provider,
       CASE a.provider WHEN 'Ticketline' THEN 1 WHEN 'BOL' THEN 2 WHEN 'Fever' THEN 3 ELSE 9 END AS sort_order,
       a.tq AS total_qty,
       a.tv AS total_value,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT q7 FROM bolw), 0) ELSE a.q7 END AS last7_qty,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT v7 FROM bolw), 0) ELSE a.v7 END AS last7_value,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT qy FROM bolw), 0) ELSE a.qy END AS yesterday_qty,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT vy FROM bolw), 0) ELSE a.vy END AS yesterday_value,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT qt FROM bolw), 0) ELSE a.qt END AS today_qty,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT vt FROM bolw), 0) ELSE a.vt END AS today_value,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT qf FROM bolw), 0) ELSE a.qf END AS fortnight_qty,
       CASE WHEN a.provider = 'BOL' THEN COALESCE((SELECT vf FROM bolw), 0) ELSE a.vf END AS fortnight_value
FROM agg a
WHERE COALESCE(a.tq, 0) <> 0 OR COALESCE(a.tv, 0) <> 0
ORDER BY 2, 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sales_position() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_position_by_provider() TO authenticated;
-- #197 — regra única de precedência por evento das séries diárias.
-- Ticketline: bool_or(daily_fallback_active); BOL: bool_or(enabled); Onebox: existência de linhas.
-- Usada por vw_event_daily_sales e get_daily_sales_series (sem segunda implementação).
CREATE OR REPLACE FUNCTION public.daily_sales_mirror_events()
RETURNS TABLE(event_id uuid, provider text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT c.event_id, 'bol'::text FROM public.bol_sync_config c
   GROUP BY c.event_id HAVING bool_or(COALESCE(c.enabled, false))
  UNION
  SELECT c.event_id, 'ticketline'::text FROM public.ticketline_sync_config c
   GROUP BY c.event_id HAVING bool_or(COALESCE(c.daily_fallback_active, false))
  UNION
  SELECT DISTINCT d.event_id, 'onebox'::text FROM public.onebox_daily_sales d
$$;
COMMENT ON FUNCTION public.daily_sales_mirror_events() IS 'Precedência POR EVENTO da série diária (#197): eventos e espelho que manda. Fonte única para vw_event_daily_sales e get_daily_sales_series.';
GRANT EXECUTE ON FUNCTION public.daily_sales_mirror_events() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_event_daily_sales WITH (security_invoker = true) AS
WITH prec AS (SELECT * FROM public.daily_sales_mirror_events()),
mirror AS (
  SELECT d.event_id, d.company_id, d.sale_date, d.quantity, d.total_value, 'ticketline'::text AS source
    FROM public.ticketline_daily_sales d
  UNION ALL
  SELECT d.event_id, d.company_id, d.sale_date, d.quantity, d.total_value, 'bol'::text
    FROM public.bol_daily_sales d
  UNION ALL
  SELECT d.event_id, d.company_id, d.sale_date, d.quantity, d.total_value, 'onebox'::text
    FROM public.onebox_daily_sales d
)
SELECT m.event_id, m.company_id, m.sale_date,
       sum(m.quantity)::integer AS quantity,
       sum(COALESCE(m.total_value, 0::numeric)) AS total_value,
       m.source
  FROM mirror m
 WHERE EXISTS (SELECT 1 FROM prec p WHERE p.event_id = m.event_id AND p.provider = m.source)
 GROUP BY m.event_id, m.company_id, m.sale_date, m.source
UNION ALL
SELECT z.event_id, ts.company_id, ts.sale_date,
       sum(ts.quantity)::integer AS quantity,
       sum(COALESCE(ts.total_value, COALESCE(ts.quantity, 0)::numeric * COALESCE(ts.unit_price, 0::numeric))) AS total_value,
       'ticket_sales'::text AS source
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
 WHERE z.event_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM prec p WHERE p.event_id = z.event_id)
 GROUP BY z.event_id, ts.company_id, ts.sale_date;

CREATE OR REPLACE FUNCTION public.get_daily_sales_series(p_start date, p_end date, p_event_ids uuid[] DEFAULT NULL::uuid[], p_provider text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, event_id uuid, event_name text, event_date date, sale_date date, provider text, qty bigint, value numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT e.id, e.name, e.date, COALESCE(e.parent_event_id, e.id) AS gid
  FROM public.events e WHERE COALESCE(e.management_type, 'own') = 'own'
),
grp AS (
  SELECT ev.gid, COALESCE(MAX(CASE WHEN ev.id = ev.gid THEN ev.name END), MIN(ev.name)) AS gname, MIN(ev.date) AS gdate
  FROM ev GROUP BY ev.gid
),
scoped AS (
  SELECT ev.id, ev.gid FROM ev
  WHERE p_event_ids IS NULL OR ev.gid = ANY(p_event_ids) OR ev.id = ANY(p_event_ids)
),
prec AS (SELECT * FROM public.daily_sales_mirror_events()),
ts_rows AS (
  SELECT s.gid, s.id AS eid, ts.sale_date,
         CASE WHEN ts.source = 'ticketline_import' THEN 'Ticketline'
              WHEN ts.source = 'bol' THEN 'BOL'
              WHEN ts.source = 'fever_import' THEN 'Fever'
              WHEN ts.source = 'onebox_import' THEN 'Onebox'
              ELSE 'Outras' END AS provider,
         SUM(ts.quantity)::bigint AS qty,
         SUM(COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0))::numeric AS value
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  JOIN scoped s ON s.id = z.event_id
  WHERE ts.sale_date BETWEEN p_start AND p_end
    AND NOT EXISTS (SELECT 1 FROM prec p WHERE p.event_id = z.event_id)
  GROUP BY 1, 2, 3, 4
),
bol_rows AS (
  SELECT s.gid, s.id AS eid, d.sale_date, 'BOL'::text AS provider,
         SUM(d.quantity)::bigint, SUM(COALESCE(d.total_value, 0))::numeric
  FROM public.bol_daily_sales d JOIN scoped s ON s.id = d.event_id
  WHERE d.sale_date BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM prec p WHERE p.event_id = d.event_id AND p.provider = 'bol')
  GROUP BY 1, 2, 3, 4
),
tl_rows AS (
  SELECT s.gid, s.id AS eid, d.sale_date, 'Ticketline'::text AS provider,
         SUM(d.quantity)::bigint, SUM(COALESCE(d.total_value, 0))::numeric
  FROM public.ticketline_daily_sales d JOIN scoped s ON s.id = d.event_id
  WHERE d.sale_date BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM prec p WHERE p.event_id = d.event_id AND p.provider = 'ticketline')
  GROUP BY 1, 2, 3, 4
),
ob_rows AS (
  SELECT s.gid, s.id AS eid, d.sale_date, 'Onebox'::text AS provider,
         SUM(d.quantity)::bigint, SUM(COALESCE(d.total_value, 0))::numeric
  FROM public.onebox_daily_sales d JOIN scoped s ON s.id = d.event_id
  WHERE d.sale_date BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM prec p WHERE p.event_id = d.event_id AND p.provider = 'onebox')
  GROUP BY 1, 2, 3, 4
),
allr AS (
  SELECT * FROM ts_rows UNION ALL SELECT * FROM bol_rows UNION ALL SELECT * FROM tl_rows UNION ALL SELECT * FROM ob_rows
)
SELECT a.gid, a.eid, g.gname, g.gdate, a.sale_date, a.provider, SUM(a.qty)::bigint, SUM(a.value)::numeric
FROM allr a JOIN grp g ON g.gid = a.gid
WHERE p_provider IS NULL OR a.provider = p_provider
GROUP BY 1, 2, 3, 4, 5, 6
HAVING SUM(a.qty) <> 0 OR SUM(a.value) <> 0
ORDER BY 3, 5, 6;
$function$;
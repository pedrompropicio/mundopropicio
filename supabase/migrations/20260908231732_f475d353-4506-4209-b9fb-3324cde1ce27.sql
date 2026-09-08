CREATE OR REPLACE VIEW public.vw_event_daily_sales
WITH (security_invoker = true) AS
WITH mirror AS (
  SELECT event_id, company_id, sale_date::date AS sale_date, quantity, total_value, 'ticketline'::text AS source
  FROM public.ticketline_daily_sales
  UNION ALL
  SELECT event_id, company_id, sale_date::date, quantity, total_value, 'bol'::text
  FROM public.bol_daily_sales
  UNION ALL
  SELECT event_id, company_id, sale_date::date, quantity, total_value, 'onebox'::text
  FROM public.onebox_daily_sales
)
SELECT m.event_id,
       m.company_id,
       m.sale_date,
       SUM(m.quantity)::int AS quantity,
       SUM(COALESCE(m.total_value, 0))::numeric AS total_value,
       m.source
FROM mirror m
GROUP BY m.event_id, m.company_id, m.sale_date, m.source
UNION ALL
SELECT z.event_id,
       ts.company_id,
       ts.sale_date::date AS sale_date,
       SUM(ts.quantity)::int AS quantity,
       SUM(COALESCE(ts.total_value, COALESCE(ts.quantity, 0) * COALESCE(ts.unit_price, 0)))::numeric AS total_value,
       'ticket_sales'::text AS source
FROM public.ticket_sales ts
JOIN public.event_ticket_zones z ON z.id = ts.zone_id
WHERE z.event_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mirror mm WHERE mm.event_id = z.event_id)
GROUP BY z.event_id, ts.company_id, ts.sale_date::date;

GRANT SELECT ON public.vw_event_daily_sales TO authenticated;
GRANT SELECT ON public.vw_event_daily_sales TO service_role;
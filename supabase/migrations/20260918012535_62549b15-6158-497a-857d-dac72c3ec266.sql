CREATE OR REPLACE FUNCTION public.get_event_ticket_sales_totals(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, quantity bigint, gross numeric, net numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    z.event_id,
    sum(coalesce(ts.quantity, 0))::bigint AS quantity,
    sum(coalesce(ts.total_value, ts.quantity * ts.unit_price)) AS gross,
    sum(
      coalesce(ts.total_value, ts.quantity * ts.unit_price)
      / (1 + coalesce(l.iva_rate, 0) / 100.0)
    ) AS net
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id = ts.zone_id
  LEFT JOIN public.event_ticket_lots l ON l.id = ts.lot_id
  WHERE z.event_id = ANY(p_event_ids)
  GROUP BY z.event_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_ticket_sales_totals(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_event_ticket_sales_totals(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_sales_totals(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_sales_totals(uuid[]) TO service_role;
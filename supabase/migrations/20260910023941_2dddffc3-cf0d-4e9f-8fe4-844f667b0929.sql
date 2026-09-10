CREATE OR REPLACE FUNCTION public.get_ticket_office_sales(p_account_id uuid)
RETURNS TABLE (event_id uuid, quantity numeric, revenue numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT z.event_id,
         COALESCE(SUM(s.quantity), 0)::numeric AS quantity,
         COALESCE(SUM(COALESCE(s.total_value, s.quantity * s.unit_price)), 0)::numeric AS revenue
    FROM public.ticket_sales s
    JOIN public.event_ticket_zones z ON z.id = s.zone_id
   WHERE s.financial_account_id = p_account_id
   GROUP BY z.event_id
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_office_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_office_sales(uuid) TO service_role;
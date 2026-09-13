CREATE OR REPLACE FUNCTION public.get_partner_event_tx_aggregates(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  tx_type text,
  category_id uuid,
  iva_rate numeric,
  base_amount numeric,
  iva_amount numeric,
  gross_amount numeric,
  tx_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  WITH req AS (
    SELECT e.id, e.parent_event_id
    FROM public.events e
    WHERE e.id = ANY(p_event_ids)
  ),
  allowed AS (
    SELECT r.id
    FROM req r
    WHERE EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_uid
        AND pea.is_active = true
        AND (pea.event_id = r.id
             OR (r.parent_event_id IS NOT NULL AND pea.event_id = r.parent_event_id))
    )
  ),
  roots AS (
    SELECT es.id
    FROM public.event_settlements es
    JOIN allowed a ON a.id = es.event_id
    WHERE es.parent_id IS NULL
  ),
  tx AS (
    SELECT t.event_id, t.type::text AS tx_type, t.category_id,
           COALESCE(t.iva_rate, 0)::numeric AS iva_rate,
           t.amount::numeric AS amount,
           ROUND(t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2) AS iva
    FROM public.transactions t
    JOIN allowed a ON a.id = t.event_id
    WHERE t.status IN ('approved', 'paid')
      AND COALESCE(t.is_transitory, false) = false
      AND COALESCE(t.exclude_from_result, false) = false
      AND t.reversed_at IS NULL
      AND COALESCE(t.is_hidden, false) = false
      AND (
        t.event_settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM roots r WHERE r.id = t.event_settlement_id)
      )
  )
  SELECT tx.event_id,
         tx.tx_type,
         tx.category_id,
         tx.iva_rate,
         ROUND(SUM(tx.amount), 2),
         ROUND(SUM(tx.iva), 2),
         ROUND(SUM(tx.amount) + SUM(tx.iva), 2),
         COUNT(*)::integer
  FROM tx
  GROUP BY tx.event_id, tx.tx_type, tx.category_id, tx.iva_rate;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_event_tx_aggregates(uuid[]) TO authenticated;
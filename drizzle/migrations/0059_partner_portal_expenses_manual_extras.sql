-- #148: Portal do Sócio passa a ver também os extras manuais (event_partner_extras).
-- Mesma guarda (auth.uid, user_supplier_id, partner_event_access, só os do próprio sócio).
CREATE OR REPLACE FUNCTION public.get_partner_event_partner_expenses(p_event_ids uuid[])
RETURNS TABLE(kind text, id uuid, event_id uuid, notes text, entry_date date, description text, base_amount numeric, iva_rate numeric, total_amount numeric, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sup uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_sup := public.user_supplier_id(v_uid);
  IF v_sup IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH req AS (
    SELECT e.id, e.parent_event_id FROM public.events e WHERE e.id = ANY(p_event_ids)
  ),
  allowed AS (
    SELECT r.id FROM req r
    WHERE EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_uid
        AND pea.is_active = true
        AND (pea.event_id = r.id
             OR (r.parent_event_id IS NOT NULL AND pea.event_id = r.parent_event_id))
    )
  ),
  mine AS (
    SELECT ep.id FROM public.event_partners ep
     JOIN allowed a ON a.id = ep.event_id
    WHERE ep.supplier_id = v_sup
  )
  SELECT 'advance'::text, pae.id, pae.event_id, pae.notes,
         t.date::date, t.description, t.amount::numeric,
         COALESCE(t.iva_rate, 0)::numeric,
         ROUND(t.amount + t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2),
         pae.created_at
  FROM public.partner_advance_expenses pae
  JOIN allowed a ON a.id = pae.event_id
  JOIN mine m ON m.id = pae.partner_id
  LEFT JOIN public.transactions t ON t.id = pae.transaction_id
  UNION ALL
  SELECT 'paid'::text, ppe.id, ppe.event_id, ppe.notes,
         COALESCE(ppe.paid_date, t.date)::date, t.description, t.amount::numeric,
         COALESCE(t.iva_rate, 0)::numeric,
         ROUND(t.amount + t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2),
         ppe.created_at
  FROM public.partner_paid_expenses ppe
  JOIN allowed a ON a.id = ppe.event_id
  JOIN mine m ON m.id = ppe.partner_id
  LEFT JOIN public.transactions t ON t.id = ppe.transaction_id
  UNION ALL
  SELECT CASE WHEN epe.kind = 'disbursement_adjustment' THEN 'manual_adjustment' ELSE 'manual' END::text,
         epe.id, epe.event_id, epe.notes,
         epe.created_at::date, epe.description, epe.amount::numeric,
         0::numeric, ROUND(epe.amount, 2), epe.created_at
  FROM public.event_partner_extras epe
  JOIN allowed a ON a.id = epe.event_id
  JOIN mine m ON m.id = epe.partner_id;
END;
$function$;
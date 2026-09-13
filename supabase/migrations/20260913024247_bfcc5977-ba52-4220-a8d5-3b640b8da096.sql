DROP FUNCTION IF EXISTS public.event_partners_sync_from_settlements(uuid);

CREATE OR REPLACE FUNCTION public.event_partners_sync_from_settlements(_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_count integer := 0;
BEGIN
  SELECT company_id INTO v_company FROM public.events WHERE id = _event_id;
  IF v_company IS NULL THEN RETURN 0; END IF;

  DROP TABLE IF EXISTS _eff;
  CREATE TEMP TABLE _eff ON COMMIT DROP AS
  WITH parts AS (
    SELECT p.supplier_id, p.mode, p.profit_pct, p.loss_pct,
           p.expense_includes_iva, p.can_order, p.can_pay, p.created_at,
           (s.parent_id IS NULL) AS is_root
      FROM public.event_settlement_participants p
      JOIN public.event_settlements s ON s.id = p.settlement_id
     WHERE p.event_id = _event_id
       AND p.participant_kind = 'partner'
       AND p.supplier_id IS NOT NULL
  )
  SELECT DISTINCT ON (supplier_id)
         supplier_id, profit_pct, loss_pct, expense_includes_iva, can_order, can_pay
    FROM parts
   ORDER BY supplier_id,
            (mode = 'settles') DESC,
            is_root DESC,
            created_at ASC;

  BEGIN
    DELETE FROM public.event_partners ep
     WHERE ep.event_id = _event_id
       AND NOT EXISTS (SELECT 1 FROM _eff e WHERE e.supplier_id = ep.supplier_id);
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Não é possível remover o sócio do evento: existem lançamentos que o referenciam. Remova-o primeiro dos pagamentos/despesas.';
  END;

  UPDATE public.event_partners ep
     SET percentage = e.profit_pct,
         loss_percentage = e.loss_pct,
         expense_includes_iva = e.expense_includes_iva,
         can_order = e.can_order,
         can_pay = e.can_pay,
         updated_at = now()
    FROM _eff e
   WHERE ep.event_id = _event_id
     AND e.supplier_id = ep.supplier_id
     AND (ep.percentage, ep.loss_percentage, ep.expense_includes_iva, ep.can_order, ep.can_pay)
         IS DISTINCT FROM
         (e.profit_pct, e.loss_pct, e.expense_includes_iva, e.can_order, e.can_pay);

  INSERT INTO public.event_partners
    (event_id, company_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay)
  SELECT _event_id, v_company, e.supplier_id, e.profit_pct, e.loss_pct,
         e.expense_includes_iva, e.can_order, e.can_pay
    FROM _eff e
   WHERE NOT EXISTS (
     SELECT 1 FROM public.event_partners ep
      WHERE ep.event_id = _event_id AND ep.supplier_id = e.supplier_id
   );

  UPDATE public.event_settlement_participants p
     SET event_partner_id = ep.id
    FROM public.event_partners ep
   WHERE p.event_id = _event_id
     AND p.participant_kind = 'partner'
     AND p.mode = 'settles'
     AND p.supplier_id = ep.supplier_id
     AND ep.event_id = _event_id
     AND p.event_partner_id IS DISTINCT FROM ep.id;

  SELECT count(*) INTO v_count FROM public.event_partners WHERE event_id = _event_id;
  RETURN v_count;
END $function$;

REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.event_partners_sync_from_settlements(uuid) TO service_role;
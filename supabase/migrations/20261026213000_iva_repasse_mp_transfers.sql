-- (IVA repasse) get_partner_settlement_summary: o IVA 23% do repasse passa a
-- incidir sobre max(0, base a transferir + transferencias ja feitas pela MP
-- nas contas de acerto do socio, categoria 10.3 / 10.3.*).
-- Mesma assinatura e mesmas colunas (sem DROP). transfer_base nao muda.
-- Total faturado fica fora do Portal (decisao do Pedro, 26/10/2026).
-- NAO APLICADO: aguarda "Sim" do Pedro. Base: definicao Live md5 44961856dd32c3fb7afdae714bfe855a.

CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)
 RETURNS TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid;
  v_gross boolean := false;
  v_ids uuid[];
  v_pids uuid[];
  v_disb numeric := 0;
  v_adj numeric := 0;
  v_held numeric := 0;
  v_extras numeric := 0;
  v_base numeric := 0;
  v_vat numeric := 0;
  v_mp numeric := 0;
  v_vat_base numeric := 0;
BEGIN
  v_supplier := public.user_supplier_id(auth.uid());
  IF v_supplier IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_settlement_participants sp
    WHERE sp.settlement_id = _settlement_id
      AND sp.event_id = _event_id
      AND sp.mode = 'settles'
      AND sp.supplier_id = v_supplier
  ) THEN
    RETURN;
  END IF;

  SELECT (s.doc_locale = 'pt-BR') INTO v_gross FROM public.suppliers s WHERE s.id = v_supplier;

  SELECT array_agg(e.id) INTO v_ids
  FROM public.events e
  WHERE e.id = _event_id OR e.parent_event_id = _event_id;

  SELECT array_agg(x) INTO v_pids
  FROM public.user_event_partner_ids(auth.uid(), v_ids) x;
  v_pids := COALESCE(v_pids, ARRAY[]::uuid[]);

  SELECT COALESCE(SUM(t.amount * CASE WHEN v_gross THEN 1 + COALESCE(t.iva_rate, 0) / 100.0 ELSE 1 END), 0)
    INTO v_disb
  FROM public.partner_paid_expenses ppe
  JOIN public.transactions t ON t.id = ppe.transaction_id
  WHERE ppe.partner_id = ANY (v_pids) AND ppe.event_id = ANY (v_ids);

  SELECT v_disb + COALESCE(SUM(f.amount * CASE WHEN v_gross THEN 1 + COALESCE(f.iva_rate, 0) / 100.0 ELSE 1 END), 0)
    INTO v_disb
  FROM public.event_forecasts f
  WHERE f.paying_partner_id = ANY (v_pids)
    AND f.event_id = ANY (v_ids)
    AND f.type = 'expense'
    AND f.status = 'approved'
    AND f.version_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.partner_paid_expenses ppe2
      WHERE ppe2.transaction_id = f.transaction_id AND ppe2.partner_id = ANY (v_pids)
    );

  SELECT
    COALESCE(SUM(CASE WHEN x.kind = 'disbursement_adjustment' THEN x.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN x.kind = 'extra' THEN x.amount ELSE 0 END), 0)
    INTO v_adj, v_extras
  FROM public.event_partner_extras x
  WHERE x.partner_id = ANY (v_pids) AND x.event_id = ANY (v_ids);

  SELECT COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  JOIN public.financial_accounts fa ON fa.id = t.account_id
  WHERE fa.partner_id = ANY (v_pids)
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  SELECT v_held + COALESCE(SUM(o.operator_result), 0) INTO v_held
  FROM public.event_third_party_operations o
  WHERE o.held_by_supplier_id = v_supplier AND o.event_id = ANY (v_ids);

  SELECT v_held + COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  WHERE t.held_by_supplier_id = v_supplier
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  v_base := ROUND(COALESCE(_partner_share, 0) + v_disb + v_adj - v_held - v_extras, 2);

  -- (IVA repasse) Transferências já feitas pela MP ao sócio: entradas nas contas
  -- de acerto do sócio com categoria 10.3 / 10.3.* (transferências internas).
  SELECT COALESCE(SUM(t.amount), 0) INTO v_mp
  FROM public.transactions t
  JOIN public.financial_accounts fa ON fa.id = t.account_id
  JOIN public.account_categories c ON c.id = t.category_id
  WHERE fa.partner_id = ANY (v_pids)
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved')
    AND (c.code = '10.3' OR c.code LIKE '10.3.%');

  IF _transfer_with_vat THEN
    v_vat_base := GREATEST(0, ROUND(v_base + v_mp, 2));
    IF v_vat_base > 0 THEN
      v_vat := ROUND(v_vat_base * 0.23, 2);
    END IF;
  END IF;

  RETURN QUERY SELECT
    ROUND(COALESCE(_partner_share, 0), 2),
    ROUND(v_disb, 2), ROUND(v_adj, 2), ROUND(v_held, 2), ROUND(v_extras, 2),
    v_base, v_vat, ROUND(v_base + v_vat, 2);
END;
$function$;

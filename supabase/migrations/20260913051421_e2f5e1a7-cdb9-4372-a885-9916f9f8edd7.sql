-- (g5) 1) Ajustes ao desembolso reutilizando event_partner_extras
ALTER TABLE public.event_partner_extras
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'extra';

ALTER TABLE public.event_partner_extras
  ADD CONSTRAINT event_partner_extras_kind_check
  CHECK (kind IN ('extra', 'disbursement_adjustment'));

COMMENT ON COLUMN public.event_partner_extras.kind IS
  '(g5) extra = abate ao acerto do socio; disbursement_adjustment = ajuste ao desembolso (amount com sinal).';

-- (g5) 2) "Resultado ficou com" nas operacoes de terceiros
ALTER TABLE public.event_third_party_operations
  ADD COLUMN IF NOT EXISTS held_by_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_third_party_operations.held_by_supplier_id IS
  '(g5) Socio/entidade que ficou com o operator_result: conta como receita em poder desse socio.';

-- (g5) 3) RPC do Portal do Socio: so agregados do proprio socio
CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(
  _event_id uuid,
  _settlement_id uuid,
  _partner_share numeric DEFAULT 0,
  _transfer_with_vat boolean DEFAULT false
)
RETURNS TABLE (
  partner_share numeric,
  disbursement numeric,
  adjustments numeric,
  revenues_held numeric,
  extras numeric,
  transfer_base numeric,
  transfer_vat numeric,
  transfer_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier uuid;
  v_gross boolean := false;
  v_ids uuid[];
  v_disb numeric := 0;
  v_adj numeric := 0;
  v_held numeric := 0;
  v_extras numeric := 0;
  v_base numeric := 0;
  v_vat numeric := 0;
BEGIN
  SELECT p.linked_supplier_id INTO v_supplier
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_supplier IS NULL THEN RETURN; END IF;

  -- o socio tem de participar neste fechamento
  IF NOT EXISTS (
    SELECT 1 FROM public.event_settlement_participants sp
    WHERE sp.settlement_id = _settlement_id
      AND sp.event_id = _event_id
      AND sp.supplier_id = v_supplier
  ) THEN
    RETURN;
  END IF;

  SELECT (s.doc_locale = 'pt-BR') INTO v_gross FROM public.suppliers s WHERE s.id = v_supplier;

  SELECT array_agg(e.id) INTO v_ids
  FROM public.events e
  WHERE e.id = _event_id OR e.parent_event_id = _event_id;

  -- (A) desembolso: transacoes pagas pelo socio + linhas de BP com pagador = socio
  SELECT COALESCE(SUM(t.amount * CASE WHEN v_gross THEN 1 + COALESCE(t.iva_rate, 0) / 100 ELSE 1 END), 0)
    INTO v_disb
  FROM public.partner_paid_expenses ppe
  JOIN public.transactions t ON t.id = ppe.transaction_id
  WHERE ppe.partner_id = v_supplier AND ppe.event_id = ANY (v_ids);

  SELECT v_disb + COALESCE(SUM(f.amount * CASE WHEN v_gross THEN 1 + COALESCE(f.iva_rate, 0) / 100 ELSE 1 END), 0)
    INTO v_disb
  FROM public.event_forecasts f
  WHERE f.paying_partner_id = v_supplier
    AND f.event_id = ANY (v_ids)
    AND f.type = 'expense'
    AND f.status = 'approved'
    AND f.version_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.partner_paid_expenses ppe2
      WHERE ppe2.transaction_id = f.transaction_id AND ppe2.partner_id = v_supplier
    );

  -- (B) ajustes ao desembolso e (extras) abates ao acerto
  SELECT
    COALESCE(SUM(CASE WHEN x.kind = 'disbursement_adjustment' THEN x.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN x.kind = 'extra' THEN x.amount ELSE 0 END), 0)
    INTO v_adj, v_extras
  FROM public.event_partner_extras x
  WHERE x.partner_id = v_supplier AND x.event_id = ANY (v_ids);

  -- (C) receitas em poder do socio
  SELECT COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  JOIN public.financial_accounts fa ON fa.id = t.account_id
  WHERE fa.partner_id = v_supplier
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  SELECT v_held + COALESCE(SUM(o.operator_result), 0) INTO v_held
  FROM public.event_third_party_operations o
  WHERE o.held_by_supplier_id = v_supplier AND o.event_id = ANY (v_ids);

  v_base := ROUND(COALESCE(_partner_share, 0) + v_disb + v_adj - v_held - v_extras, 2);
  IF _transfer_with_vat AND v_base > 0 THEN
    v_vat := ROUND(v_base * 0.23, 2);
  END IF;

  RETURN QUERY SELECT
    ROUND(COALESCE(_partner_share, 0), 2),
    ROUND(v_disb, 2), ROUND(v_adj, 2), ROUND(v_held, 2), ROUND(v_extras, 2),
    v_base, v_vat, ROUND(v_base + v_vat, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_partner_settlement_summary(uuid, uuid, numeric, boolean) TO authenticated;
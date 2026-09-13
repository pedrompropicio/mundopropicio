-- (g7) "Recebido por" nas receitas liquidadas por encontro de contas.
-- Uma compensação nunca tem conta (trigger force_no_account_on_compensation), por isso
-- o dinheiro que fica com um sócio marca-se na própria transação.

-- 1) coluna + índice parcial
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS held_by_supplier_id uuid NULL
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_held_by_supplier
  ON public.transactions (held_by_supplier_id)
  WHERE held_by_supplier_id IS NOT NULL;

-- 2) só receitas por compensação podem ter "Recebido por"
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_held_by_only_compensation_income
  CHECK (held_by_supplier_id IS NULL OR (payment_method = 'compensation' AND type = 'income'));

-- 3) bloco (C) da get_partner_settlement_summary: somar as receitas por compensação
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

  -- (g7) receitas recebidas por encontro de contas em nome do socio.
  -- Sem interseccao com o bloco das contas de acerto acima: uma transacao de
  -- compensacao nunca tem account_id (trigger force_no_account_on_compensation).
  SELECT v_held + COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  WHERE t.held_by_supplier_id = v_supplier
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  v_base := ROUND(COALESCE(_partner_share, 0) + v_disb + v_adj - v_held - v_extras, 2);
  IF _transfer_with_vat AND v_base > 0 THEN
    v_vat := ROUND(v_base * 0.23, 2);
  END IF;

  RETURN QUERY SELECT
    ROUND(COALESCE(_partner_share, 0), 2),
    ROUND(v_disb, 2), ROUND(v_adj, 2), ROUND(v_held, 2), ROUND(v_extras, 2),
    v_base, v_vat, ROUND(v_base + v_vat, 2);
END;
$function$;

-- 4) receita em poder de um socio nasce liquidada: nunca pode ficar "a receber"
CREATE OR REPLACE FUNCTION public.enforce_held_revenue_is_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_by_supplier_id IS NOT NULL THEN
    NEW.status := 'paid';
    NEW.payment_date := COALESCE(NEW.payment_date, NEW.date);
    NEW.paid_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_held_revenue_is_paid ON public.transactions;
CREATE TRIGGER trg_enforce_held_revenue_is_paid
BEFORE INSERT OR UPDATE OF held_by_supplier_id, status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_held_revenue_is_paid();

-- 5) isentar a compensacao da trava "paga exige conta"
CREATE OR REPLACE FUNCTION public.enforce_tx_paid_requires_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.account_id IS NULL THEN
    -- Isenções documentadas:
    --  * fluxos server-side (edge functions / importações) correm como service_role
    --  * transitórias (caução, irmã "extra do sócio"), fora do resultado e reembolsos
    --    nascem legitimamente sem conta da empresa
    --  * (g7) compensação: encontro de contas NUNCA tem conta por desenho
    --    (trigger force_no_account_on_compensation limpa account_id), e uma receita
    --    com "Recebido por" nasce paga (trg_enforce_held_revenue_is_paid)
    IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_storage_admin')
       OR COALESCE(NEW.is_transitory, false)
       OR COALESCE(NEW.exclude_from_result, false)
       OR COALESCE(NEW.is_reimbursement, false)
       OR COALESCE(NEW.payment_method, '') = 'compensation' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Transação paga exige conta financeira associada (account_id).';
  END IF;
  RETURN NEW;
END;
$function$;
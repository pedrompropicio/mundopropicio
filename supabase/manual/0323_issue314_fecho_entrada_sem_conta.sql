-- 0323 — #314 E2b: repasse pendente do fecho com entrada sem conta e trava diferida.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização: 6629854062.
-- Origem: decisão do Pedro de 21/10/2026 (#314, ponto 1 + «Trava») e decisões
-- de 04/11/2026 (despacho próprio; #313 ponto 3 entregue no PR #620; sem colisão com #401).
-- Resposta 2 A em 6629854062: uma violação prévia aborta a 0323; corrigir os dados
-- primeiro por DML próprio, fora desta migração. Sem correções automáticas de dados.
-- Fechos por apuramento e reconcile_bank_line não mudam. CREATE OR REPLACE preserva ACL.
-- Executor: E2b. Aplicação e verificação de catálogo em Live ficam para janela autorizada.
-- Rollback: supabase/manual/rollback_0323_issue314_fecho_entrada_sem_conta_comentado.sql

-- §0 — Recusar a preparação aplicada sobre dados já incompatíveis.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE status = 'paid' AND account_id IS NULL
      AND (operation_key LIKE 'TRF-FECHO-%' OR operation_key LIKE 'DEVOL-SALA-%')
  ) THEN
    RAISE EXCEPTION '#314: existem pernas de fecho/devolução pagas sem banco; corrigir por DML próprio antes da 0323'
      USING ERRCODE = '23514';
  END IF;
END;
$preflight$;

-- §1 — Origem: supabase/migrations/20260912193941_e33bfb5f-eba7-440a-a815-f8e6b4f43651.sql.
CREATE OR REPLACE FUNCTION public.create_settlement_transfer(
  p_settlement_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_credited boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_settlement record;
  v_from_name text;
  v_to_name text;
  v_key text;
  v_desc text;
  v_out uuid;
  v_status text;
  v_paid numeric;
  v_pay_date date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin')
      OR public.is_platform_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'manage_accounts')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para lançar a transferência do fecho' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement FROM public.ticket_office_settlements WHERE id = p_settlement_id;

  IF v_settlement.id IS NULL THEN
    RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_settlement.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_settlement.transfer_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este fecho já tem transferência lançada' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor da transferência tem de ser positivo' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta de origem (bilheteira) é obrigatória' USING ERRCODE = '22023';
  END IF;
  IF p_to_account_id IS NULL AND p_credited THEN
    RAISE EXCEPTION 'Crédito confirmado exige banco; sem banco o repasse fica a receber' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Conta de origem e destino não podem ser a mesma' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_from_name FROM public.financial_accounts WHERE id = p_from_account_id;
  SELECT name INTO v_to_name FROM public.financial_accounts WHERE id = p_to_account_id;

  v_key := 'TRF-FECHO-' || upper(substring(replace(p_settlement_id::text, '-', '') FROM 1 FOR 8));
  v_desc := 'Transferência fecho bilheteira ' || coalesce(v_from_name, '?')
            || ' -> ' || coalesce(v_to_name, CASE WHEN p_to_account_id IS NULL THEN 'banco na liquidação' ELSE '?' END)
            || CASE WHEN p_credited THEN '' ELSE ' (a receber)' END;

  IF p_credited THEN
    v_status := 'paid'; v_paid := p_amount; v_pay_date := p_date;
  ELSE
    v_status := 'pending'; v_paid := 0; v_pay_date := NULL;
  END IF;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'expense', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_from_account_id, 'transfer',
    true, 'EUR', p_settlement_id, v_key
  ) RETURNING id INTO v_out;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'income', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_to_account_id, 'transfer',
    true, 'EUR', NULL, v_key
  );

  UPDATE public.ticket_office_settlements
  SET transfer_transaction_id = v_out,
      net_transferred = p_amount,
      transfer_account_id = p_to_account_id
  WHERE id = p_settlement_id;

  RETURN v_out;
END;
$$;

-- §2 — Origem: drizzle/migrations/0094_derp_296_triggers_own_invoice_paid.sql, linhas 5–198.
-- Única alteração: to_account_id ausente ou vazio passa a NULL antes do cast uuid.
CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement(
  p_settlement_id uuid,
  p_payload jsonb,
  p_confirm boolean,
  p_selected jsonb,
  p_transfer jsonb,
  p_retained_payment_notes text,
  p_remainder_payment_notes text,
  p_audit_user text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_prev public.ticket_office_settlements%ROWTYPE;
  v_has_prev boolean := false;
  v_office uuid := (p_payload->>'financial_account_id')::uuid;
  v_event uuid := nullif(p_payload->>'event_id','')::uuid;
  v_date date := (p_payload->>'settlement_date')::date;
  v_ids uuid[];
  v_ret_amt numeric := coalesce((p_payload->>'venue_retained_amount')::numeric, 0);
  v_inv uuid := nullif(p_payload->>'venue_retained_invoice_id','')::uuid;
  v_rem_applied boolean := coalesce((p_payload->>'venue_invoice_remainder_paid')::boolean, false);
  v_rem_amt numeric := coalesce((p_payload->>'venue_invoice_remainder_amount')::numeric, 0);
  v_need_rev boolean;
  v_need_rev_rem boolean;
  v_tx record;
  v_pay uuid;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid)
          OR public.has_permission(v_uid, 'manage_accounts')) THEN
    RAISE EXCEPTION 'Sem permissão para gravar o fecho de bilheteira' USING ERRCODE = '42501';
  END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = v_company) THEN
    RAISE EXCEPTION 'Bilheteira de outra empresa' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_ids FROM jsonb_array_elements(coalesce(p_selected,'[]'::jsonb)) x;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ANY(v_ids) AND t.company_id IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Dedução de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_inv IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_inv AND company_id = v_company) THEN
    RAISE EXCEPTION 'Fatura de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF p_settlement_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF v_prev.id IS NULL OR v_prev.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'Fecho não encontrado nesta empresa' USING ERRCODE = '42501';
    END IF;
    v_has_prev := true;
    v_id := p_settlement_id;
    UPDATE public.ticket_office_settlements SET
      financial_account_id = v_office, event_id = v_event, settlement_date = v_date,
      gross_revenue = (p_payload->>'gross_revenue')::numeric,
      total_deductions = (p_payload->>'total_deductions')::numeric,
      net_calculated = (p_payload->>'net_calculated')::numeric,
      net_adjusted = nullif(p_payload->>'net_adjusted','')::numeric,
      adjustment_notes = p_payload->>'adjustment_notes',
      gross_adjustment_notes = p_payload->>'gross_adjustment_notes',
      forma_liquidacao_manual = p_payload->>'forma_liquidacao_manual',
      forma_liquidacao_manual_notes = p_payload->>'forma_liquidacao_manual_notes',
      net_transferred = coalesce((p_payload->>'net_transferred')::numeric, 0),
      transfer_account_id = nullif(p_payload->>'transfer_account_id','')::uuid,
      document_url = p_payload->>'document_url',
      document_name = p_payload->>'document_name',
      notes = p_payload->>'notes',
      venue_retained_amount = v_ret_amt,
      venue_retained_invoice_id = v_inv,
      venue_retained_notes = p_payload->>'venue_retained_notes',
      venue_invoice_remainder_paid = v_rem_applied,
      venue_invoice_remainder_amount = v_rem_amt,
      status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      closed_at = CASE WHEN p_confirm THEN now() ELSE closed_at END,
      closed_by = CASE WHEN p_confirm THEN v_uid ELSE closed_by END
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ticket_office_settlements (
      company_id, financial_account_id, event_id, settlement_date, gross_revenue, total_deductions,
      net_calculated, net_adjusted, adjustment_notes, gross_adjustment_notes,
      forma_liquidacao_manual, forma_liquidacao_manual_notes, net_transferred, transfer_account_id,
      document_url, document_name, notes, venue_retained_amount, venue_retained_invoice_id,
      venue_retained_notes, venue_invoice_remainder_paid, venue_invoice_remainder_amount,
      status, closed_at, closed_by, created_by
    ) VALUES (
      v_company, v_office, v_event, v_date, (p_payload->>'gross_revenue')::numeric,
      (p_payload->>'total_deductions')::numeric, (p_payload->>'net_calculated')::numeric,
      nullif(p_payload->>'net_adjusted','')::numeric, p_payload->>'adjustment_notes',
      p_payload->>'gross_adjustment_notes', p_payload->>'forma_liquidacao_manual',
      p_payload->>'forma_liquidacao_manual_notes', coalesce((p_payload->>'net_transferred')::numeric, 0),
      nullif(p_payload->>'transfer_account_id','')::uuid, p_payload->>'document_url',
      p_payload->>'document_name', p_payload->>'notes', v_ret_amt, v_inv,
      p_payload->>'venue_retained_notes', v_rem_applied, v_rem_amt,
      CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      CASE WHEN p_confirm THEN now() END, CASE WHEN p_confirm THEN v_uid END, v_uid
    ) RETURNING id INTO v_id;
  END IF;

  IF p_confirm AND p_transfer IS NOT NULL AND coalesce((p_transfer->>'amount')::numeric,0) > 0
     AND NOT (v_has_prev AND v_prev.transfer_transaction_id IS NOT NULL) THEN
    PERFORM public.create_settlement_transfer(v_id, v_office, nullif(p_transfer->>'to_account_id','')::uuid,
      (p_transfer->>'amount')::numeric, v_date, coalesce((p_transfer->>'credited')::boolean, false));
  END IF;

  IF v_has_prev THEN
    UPDATE public.transactions t SET settlement_id = NULL
     WHERE t.settlement_id = v_id
       AND NOT (t.id = ANY(v_ids))
       AND t.id IS DISTINCT FROM (SELECT transfer_transaction_id FROM public.ticket_office_settlements WHERE id = v_id)
       AND coalesce(t.operation_key,'') NOT LIKE 'TRF-FECHO-%';
  END IF;

  IF array_length(v_ids,1) > 0 THEN
    IF p_confirm THEN
      FOR r IN SELECT (x->>'id')::uuid AS id, (x->>'paid_amount')::numeric AS paid
                 FROM jsonb_array_elements(p_selected) x LOOP
        IF r.paid IS NULL THEN
          UPDATE public.transactions SET settlement_id = v_id WHERE id = r.id;
          CONTINUE;
        END IF;
        SELECT id, reversed_at INTO v_tx FROM public.transactions WHERE id = r.id FOR UPDATE;
        IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Dedução % não encontrada', r.id; END IF;
        UPDATE public.transactions SET settlement_id = v_id, status = 'paid', payment_date = v_date,
               account_id = v_office, paid_amount = r.paid,
               reversed_at = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversed_at END,
               reversal_kind = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversal_kind END
         WHERE id = r.id;
        IF v_tx.reversed_at IS NOT NULL THEN
          INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
          VALUES (r.id, p_audit_user, 'Estorno', 'Estornada em ' || to_char(v_tx.reversed_at, 'YYYY-MM-DD'),
                  'Carimbo de estorno limpo — transação voltou a ser paga');
        END IF;
      END LOOP;
    ELSE
      UPDATE public.transactions SET settlement_id = v_id WHERE id = ANY(v_ids);
    END IF;
  END IF;

  v_need_rev := v_has_prev AND v_prev.venue_retained_payment_id IS NOT NULL AND (
    NOT p_confirm OR v_inv IS NULL OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_ret_amt - coalesce(v_prev.venue_retained_amount,0)) > 0.005);
  IF v_need_rev THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_retained_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento de compensação anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_ret_amt > 0 AND v_inv IS NOT NULL
     AND (v_need_rev OR NOT v_has_prev OR v_prev.venue_retained_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_ret_amt, v_date, 'compensation', NULL, p_retained_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = v_pay WHERE id = v_id;
  END IF;

  v_need_rev_rem := v_has_prev AND v_prev.venue_invoice_remainder_payment_id IS NOT NULL AND (
    NOT p_confirm OR NOT v_rem_applied OR v_inv IS NULL
    OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_rem_amt - coalesce(v_prev.venue_invoice_remainder_amount,0)) > 0.005);
  IF v_need_rev_rem THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_invoice_remainder_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento do saldo restante anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_rem_applied AND v_inv IS NOT NULL
     AND (v_need_rev_rem OR NOT v_has_prev OR v_prev.venue_invoice_remainder_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_rem_amt, v_date, 'transfer', v_office, p_remainder_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = v_pay WHERE id = v_id;
  END IF;

  IF p_confirm AND v_event IS NOT NULL THEN
    UPDATE public.event_ticket_office_assignments
       SET is_conciliated = true, conciliated_at = now(), conciliated_by = coalesce(nullif(p_payload->>'conciliated_by',''), 'system')
     WHERE event_id = v_event AND financial_account_id = v_office;
  END IF;

  RETURN jsonb_build_object('settlement_id', v_id);
END;
$function$;

-- §3 — Validar o estado final, permitindo a sequência settle: paid → account_id → COMMIT.
CREATE OR REPLACE FUNCTION public.enforce_settlement_pair_paid_requires_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
BEGIN
  SELECT status, account_id, operation_key INTO v_tx
    FROM public.transactions WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_tx.status = 'paid' AND v_tx.account_id IS NULL
     AND (v_tx.operation_key LIKE 'TRF-FECHO-%' OR v_tx.operation_key LIKE 'DEVOL-SALA-%') THEN
    RAISE EXCEPTION '#314: perna de par do fecho/devolução paga exige banco'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_settlement_pair_paid_requires_account() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER trg_settlement_pair_paid_requires_account
AFTER INSERT OR UPDATE OF status, account_id, operation_key ON public.transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status = 'paid' AND NEW.account_id IS NULL
  AND (NEW.operation_key LIKE 'TRF-FECHO-%' OR NEW.operation_key LIKE 'DEVOL-SALA-%'))
EXECUTE FUNCTION public.enforce_settlement_pair_paid_requires_account();

COMMENT ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean)
IS '#314 / 0323: repasse pendente permite entrada sem banco; crédito confirmado exige banco. Autorização 6629854062.';
COMMENT ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text)
IS '#314 / 0323: to_account_id ausente ou vazio normalizado para NULL; restante corpo preservado da 0094.';
COMMENT ON FUNCTION public.enforce_settlement_pair_paid_requires_account()
IS '#314 / 0323: valida por id o estado final das pernas TRF-FECHO-/DEVOL-SALA-; paga exige banco, sem isenções (23514).';
COMMENT ON TRIGGER trg_settlement_pair_paid_requires_account ON public.transactions
IS '#314 / 0323: constraint diferida ao COMMIT, compatível com settle paid antes de account_id e com apagar as pernas.';

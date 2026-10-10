-- D-ERP221 · #37 / #39 / #29

-- #37 — SEPA: o registo da exportação só é aceite para lista aprovada e por quem aprova listas (admin).
CREATE OR REPLACE FUNCTION public.enforce_sepa_export_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT status, company_id INTO v_status, v_company FROM public.payment_lists WHERE id = NEW.payment_list_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lista de pagamento não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('approved','partially_approved') THEN
    RAISE EXCEPTION 'Ficheiro SEPA só para listas aprovadas (estado actual: %).', v_status USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role_in(auth.uid(), 'admin', v_company)) THEN
    RAISE EXCEPTION 'Sem permissão para exportar o ficheiro SEPA (só quem aprova listas).' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_sepa_export_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_sepa_export_guard ON public.payment_list_sepa_exports;
CREATE TRIGGER trg_enforce_sepa_export_guard BEFORE INSERT ON public.payment_list_sepa_exports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sepa_export_guard();

-- #39 — Modelo B: editar valor/vencimento das parcelas planned, atómico, soma planeada mantida, auditoria por campo.
CREATE OR REPLACE FUNCTION public.update_planned_installments(p_transaction_id uuid, p_rows jsonb, p_changed_by text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_old_sum numeric; v_new_sum numeric := 0; v_item jsonb; v_row record;
        v_amount numeric; v_date date; v_n int := 0; v_ids uuid[] := '{}';
BEGIN
  SELECT company_id INTO v_company FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'transaction_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.has_role_in(auth.uid(), 'admin', v_company)
          OR public.has_role_in(auth.uid(), 'manager', v_company)) THEN
    RAISE EXCEPTION 'Sem permissão para editar o cronograma de parcelas.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Lista de parcelas inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(amount),0) INTO v_old_sum FROM public.transaction_payments
   WHERE transaction_id = p_transaction_id AND status = 'planned';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO v_row FROM public.transaction_payments
     WHERE id = (v_item->>'id')::uuid AND transaction_id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela % não pertence a esta transação.', v_item->>'id' USING ERRCODE = '42501'; END IF;
    IF v_row.status <> 'planned' THEN
      RAISE EXCEPTION 'Só parcelas planeadas são editáveis aqui (parcela paga/cancelada travada).' USING ERRCODE = '42501';
    END IF;
    v_amount := round((v_item->>'amount')::numeric, 2);
    v_date := nullif(v_item->>'scheduled_date','')::date;
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Parcela com valor inválido.' USING ERRCODE = '22023'; END IF;
    IF v_date IS NULL THEN RAISE EXCEPTION 'Parcela sem vencimento.' USING ERRCODE = '22023'; END IF;
    v_ids := v_ids || v_row.id;

    IF abs(v_amount - v_row.amount) > 0.001 OR v_date IS DISTINCT FROM v_row.scheduled_date THEN
      UPDATE public.transaction_payments SET amount = v_amount, scheduled_date = v_date, updated_at = now() WHERE id = v_row.id;
      IF abs(v_amount - v_row.amount) > 0.001 THEN
        INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
        VALUES (p_transaction_id, p_changed_by, 'Valor parcela planeada', round(v_row.amount,2)::text, v_amount::text);
      END IF;
      IF v_date IS DISTINCT FROM v_row.scheduled_date THEN
        INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
        VALUES (p_transaction_id, p_changed_by, 'Vencimento parcela planeada', coalesce(v_row.scheduled_date::text,''), v_date::text);
      END IF;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  SELECT coalesce(sum(amount),0) INTO v_new_sum FROM public.transaction_payments
   WHERE transaction_id = p_transaction_id AND status = 'planned';
  IF abs(v_new_sum - v_old_sum) > 0.01 THEN
    RAISE EXCEPTION 'A soma das parcelas planeadas (% €) tem de manter-se igual a % € para bater com o total.', v_new_sum, v_old_sum USING ERRCODE = '22023';
  END IF;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.update_planned_installments(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_planned_installments(uuid, jsonb, text) TO authenticated, service_role;

-- #29 — Repartir uma despesa por N linhas de BP: a original fica com a 1.ª linha; as restantes nascem
-- como irmãs no mesmo invoice_group_id (modelo "fatura única → N itens"). Nenhuma mãe é contada a dobrar:
-- não há mãe, só N transações irmãs cuja soma = valor original.
CREATE OR REPLACE FUNCTION public.split_transaction_by_bp_lines(p_transaction_id uuid, p_lines jsonb, p_changed_by text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx public.transactions%ROWTYPE; v_n int; v_sum numeric := 0; v_i int; v_item jsonb;
        v_fc record; v_amount numeric; v_group uuid; v_new_id uuid; v_event_status text; v_seen uuid[] := '{}';
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.has_role_in(auth.uid(), 'admin', v_tx.company_id)
          OR public.has_role_in(auth.uid(), 'manager', v_tx.company_id)
          OR public.has_permission_in(auth.uid(), 'manage_transactions', v_tx.company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para repartir a transação.' USING ERRCODE = '42501';
  END IF;
  IF v_tx.type <> 'expense' THEN RAISE EXCEPTION 'Só despesas podem ser repartidas por linhas de BP.'; END IF;
  IF v_tx.event_id IS NULL THEN RAISE EXCEPTION 'A transação não tem evento.'; END IF;
  IF coalesce(v_tx.paid_amount,0) > 0 OR v_tx.status IN ('paid','reversed')
     OR EXISTS (SELECT 1 FROM public.transaction_payments WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'A transação já tem pagamentos — reparte antes de pagar.';
  END IF;
  IF v_tx.parent_transaction_id IS NOT NULL OR v_tx.split_percentage IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.transactions WHERE parent_transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'Transações de rateio entre eventos não podem ser repartidas aqui.';
  END IF;
  IF v_tx.installment_group_id IS NOT NULL THEN RAISE EXCEPTION 'A transação pertence a um parcelamento.'; END IF;
  IF coalesce(v_tx.is_reimbursement,false) OR coalesce(v_tx.is_transitory,false) THEN
    RAISE EXCEPTION 'Reembolsos e transitórias não podem ser repartidos.';
  END IF;
  SELECT status INTO v_event_status FROM public.events WHERE id = v_tx.event_id;
  IF v_event_status = 'completed' THEN RAISE EXCEPTION 'O evento está fechado.'; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Lista de linhas inválida.'; END IF;
  v_n := jsonb_array_length(p_lines);
  IF v_n < 2 THEN RAISE EXCEPTION 'São precisas pelo menos 2 linhas de BP.'; END IF;

  FOR v_i IN 0..v_n-1 LOOP
    v_item := p_lines -> v_i;
    v_amount := round((v_item->>'amount')::numeric, 2);
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Linha % com valor inválido.', v_i+1; END IF;
    SELECT id, event_id, category_id, type, version_id, company_id INTO v_fc
      FROM public.event_forecasts WHERE id = (v_item->>'forecast_id')::uuid;
    IF NOT FOUND OR v_fc.event_id <> v_tx.event_id OR v_fc.company_id <> v_tx.company_id
       OR v_fc.version_id IS NOT NULL OR v_fc.type <> 'expense' THEN
      RAISE EXCEPTION 'Linha % não é uma linha de despesa do BP vivo deste evento.', v_i+1;
    END IF;
    IF v_fc.id = ANY(v_seen) THEN RAISE EXCEPTION 'Linha de BP repetida.'; END IF;
    v_seen := v_seen || v_fc.id;
    v_sum := v_sum + v_amount;
  END LOOP;
  IF abs(v_sum - v_tx.amount) > 0.01 THEN
    RAISE EXCEPTION 'A soma das partes (% €) tem de igualar o valor da transação (% €, s/IVA).', v_sum, v_tx.amount;
  END IF;

  v_group := coalesce(v_tx.invoice_group_id, gen_random_uuid());

  FOR v_i IN 0..v_n-1 LOOP
    v_item := p_lines -> v_i;
    v_amount := round((v_item->>'amount')::numeric, 2);
    SELECT id, category_id INTO v_fc FROM public.event_forecasts WHERE id = (v_item->>'forecast_id')::uuid;
    IF v_i = 0 THEN
      UPDATE public.transactions
         SET amount = v_amount, forecast_id = v_fc.id, category_id = v_fc.category_id,
             invoice_group_id = v_group,
             original_amount = CASE WHEN coalesce(v_tx.currency,'EUR') <> 'EUR' AND v_tx.original_amount IS NOT NULL AND v_tx.amount <> 0
                                    THEN round(v_tx.original_amount * v_amount / v_tx.amount, 2) ELSE v_tx.original_amount END,
             updated_at = now()
       WHERE id = p_transaction_id;
      INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value) VALUES
        (p_transaction_id, p_changed_by, 'Valor (repartir por linhas de BP)', round(v_tx.amount,2)::text, v_amount::text),
        (p_transaction_id, p_changed_by, 'Linha de BP (repartir)', coalesce(v_tx.forecast_id::text,''), v_fc.id::text);
    ELSE
      INSERT INTO public.transactions (
        description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, account_id,
        specification, date, due_date, status, paid_amount, payment_date,
        is_reimbursement, is_transitory, exclude_from_result,
        invoice_ref, invoice_group_id, payment_method, payment_entity, payment_reference, operation_key,
        ordering_partner_id, paying_partner_id, currency, fx_rate, fx_rate_source, original_amount, company_id
      ) VALUES (
        v_tx.description, v_tx.type, v_amount, v_tx.iva_rate, v_tx.event_id, v_fc.category_id, v_fc.id, v_tx.supplier_id, v_tx.account_id,
        v_tx.specification, v_tx.date, v_tx.due_date, v_tx.status, 0, NULL,
        false, false, coalesce(v_tx.exclude_from_result,false),
        v_tx.invoice_ref, v_group, v_tx.payment_method, v_tx.payment_entity, v_tx.payment_reference, v_tx.operation_key,
        v_tx.ordering_partner_id, v_tx.paying_partner_id, coalesce(v_tx.currency,'EUR'), v_tx.fx_rate, v_tx.fx_rate_source,
        CASE WHEN coalesce(v_tx.currency,'EUR') <> 'EUR' AND v_tx.original_amount IS NOT NULL AND v_tx.amount <> 0
             THEN round(v_tx.original_amount * v_amount / v_tx.amount, 2) ELSE NULL END,
        v_tx.company_id
      ) RETURNING id INTO v_new_id;
      INSERT INTO public.transaction_documents (transaction_id, name, file_url, doc_type, uploaded_by, uploaded_at, is_accounting, company_id, partner_visible)
        SELECT v_new_id, name, file_url, doc_type, uploaded_by, uploaded_at, is_accounting, company_id, partner_visible
          FROM public.transaction_documents WHERE transaction_id = p_transaction_id;
      INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
        VALUES (v_new_id, p_changed_by, 'Criação (repartir por linhas de BP)', p_transaction_id::text, v_amount::text || ' € (base) → linha ' || v_fc.id::text);
    END IF;
  END LOOP;
  RETURN v_group;
END $$;
REVOKE EXECUTE ON FUNCTION public.split_transaction_by_bp_lines(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_transaction_by_bp_lines(uuid, jsonb, text) TO authenticated, service_role;
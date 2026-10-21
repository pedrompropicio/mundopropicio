-- D-ERP288 correção: cancelar contrato de cachê pelo tratamento canónico de dependências
-- (igual a delete_transaction_cascade) e re-ancorar as linhas de BP afetadas (regra de sync_tx_forecast_to_anchor).
-- Só CREATE OR REPLACE de uma função interna; sem tabelas, colunas nem dados.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._cache_cancel_contract(p_uid uuid, p_contract uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c public.cache_payment_contracts%ROWTYPE; m record; v_tx record; v_by text;
  v_roots uuid[]; v_children uuid[]; v_all uuid[]; v_fcs uuid[]; f record; v_next uuid;
BEGIN
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract FOR UPDATE;
  IF NOT FOUND OR v_c.company_id <> public.current_company_id() THEN RAISE EXCEPTION 'contrato_inexistente'; END IF;
  IF v_c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_ja_cancelado'; END IF;
  PERFORM 1 FROM public.transactions WHERE id IN (v_c.artist_mother_id, v_c.withholding_mother_id) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id IN (v_c.artist_mother_id, v_c.withholding_mother_id)
               AND (t.paid_amount > 0 OR t.status = 'paid'))
     OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id IN (v_c.artist_mother_id, v_c.withholding_mother_id))
     OR EXISTS (SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id = li.payment_list_id
                 WHERE li.transaction_id IN (v_c.artist_mother_id, v_c.withholding_mother_id) AND li.removed_at IS NULL
                   AND pl.status IN ('approved','partially_approved'))
  THEN
    RAISE EXCEPTION 'contrato_com_pagamento: já há pagamento ou lista aprovada; estorne primeiro pelos fluxos normais';
  END IF;
  SELECT coalesce(email, id::text) INTO v_by FROM auth.users WHERE id = p_uid;

  SELECT coalesce(array_agg(id), '{}') INTO v_roots FROM public.transactions
   WHERE id IN (v_c.artist_mother_id, v_c.withholding_mother_id);
  PERFORM 1 FROM public.transactions WHERE parent_transaction_id = ANY(v_roots) FOR UPDATE;
  SELECT coalesce(array_agg(id), '{}') INTO v_children FROM public.transactions
   WHERE parent_transaction_id = ANY(v_roots) AND NOT (id = ANY(v_roots));
  v_all := v_roots || v_children;

  -- Lixo: uma entrada por mãe, com as próprias filhas (sem duplicar).
  FOR m IN SELECT t.* FROM public.transactions t WHERE t.id = ANY(v_roots) LOOP
    INSERT INTO public.trash(entity_type, entity_id, entity_data, related_data, deleted_by, company_id)
    VALUES ('transaction', m.id, to_jsonb(m) - 'updated_at',
            jsonb_build_object('transactions', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'updated_at'), '[]'::jsonb)
                                                  FROM public.transactions c WHERE c.parent_transaction_id = m.id)),
            coalesce(v_by,'sistema'), v_c.company_id);
  END LOOP;

  -- Dependências: mesmo tratamento de delete_transaction_cascade.
  SELECT coalesce(array_agg(id), '{}') INTO v_fcs FROM public.event_forecasts
   WHERE transaction_id = ANY(v_all) AND version_id IS NULL;
  UPDATE public.event_forecasts SET transaction_id = NULL WHERE transaction_id = ANY(v_all) AND version_id IS NULL;
  UPDATE public.event_cache_payments SET transaction_id = NULL WHERE transaction_id = ANY(v_all);
  UPDATE public.event_cache_payments SET withholding_transaction_id = NULL WHERE withholding_transaction_id = ANY(v_all);
  UPDATE public.ticket_office_settlements SET transfer_transaction_id = NULL WHERE transfer_transaction_id = ANY(v_all);
  UPDATE public.reimbursement_notes SET payment_transaction_id = NULL WHERE payment_transaction_id = ANY(v_all);
  DELETE FROM public.payment_list_items WHERE transaction_id = ANY(v_all);
  DELETE FROM public.reimbursement_note_items WHERE transaction_id = ANY(v_all);
  DELETE FROM public.partner_paid_expenses WHERE transaction_id = ANY(v_all);
  DELETE FROM public.partner_advance_expenses WHERE transaction_id = ANY(v_all);
  DELETE FROM public.supplier_credit_usages WHERE transaction_id = ANY(v_all);
  DELETE FROM public.transaction_payments WHERE transaction_id = ANY(v_all);
  DELETE FROM public.transaction_documents WHERE transaction_id = ANY(v_all);

  FOR v_tx IN SELECT * FROM public.transactions WHERE id = ANY(v_all) LOOP
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, metadata, company_id)
    VALUES ('transaction', v_tx.id::text, 'delete', coalesce(v_by, p_uid::text), to_jsonb(v_tx),
            jsonb_build_object('reason', coalesce(p_reason, 'cancelar contrato de cachê'), 'root', v_tx.id = ANY(v_roots),
                               'rpc', '_cache_cancel_contract', 'cache_contract_id', p_contract),
            v_tx.company_id);
  END LOOP;

  DELETE FROM public.transactions WHERE id = ANY(v_children);
  DELETE FROM public.transactions WHERE id = ANY(v_roots);

  UPDATE public.transactions SET cache_contract_id = NULL
   WHERE cache_contract_id = p_contract AND cache_role = 'advance';
  UPDATE public.cache_payment_contracts SET cancelled_at = now(), cancelled_by = p_uid, cancel_reason = p_reason,
         artist_mother_id = NULL, withholding_mother_id = NULL
   WHERE id = p_contract;

  -- Re-âncora: próxima transação existente na linha (regra de sync_tx_forecast_to_anchor), ou NULL.
  FOR f IN SELECT id, event_id, company_id FROM public.event_forecasts WHERE id = ANY(v_fcs) AND version_id IS NULL FOR UPDATE LOOP
    SELECT t.id INTO v_next FROM public.transactions t
     WHERE t.forecast_id = f.id AND public.bp_tx_link_allowed(t.event_id, t.company_id, f.event_id, f.company_id)
     ORDER BY t.date, t.created_at, t.id LIMIT 1;
    UPDATE public.event_forecasts SET transaction_id = v_next WHERE id = f.id AND transaction_id IS NULL;
    v_next := NULL;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._cache_cancel_contract(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
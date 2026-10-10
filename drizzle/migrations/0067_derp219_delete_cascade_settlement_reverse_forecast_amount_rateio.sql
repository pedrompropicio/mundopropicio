-- D-ERP219 (#295, #246, #150)

-- #295 (1) Eliminação de transação em cascata, atómica.
CREATE OR REPLACE FUNCTION public.delete_transaction_cascade(
  p_transaction_id uuid,
  p_reason text DEFAULT NULL,
  p_cascade_invoice_group boolean DEFAULT true,
  p_caller_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_caller text;
  v_group uuid;
  v_roots uuid[];
  v_children uuid[];
  v_all uuid[];
  v_reason text;
  v_tx record;
  v_n int;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão em falta' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar transações (só admin ou manager).' USING ERRCODE = '42501';
  END IF;
  v_caller := coalesce(nullif(trim(p_caller_name), ''), v_uid::text);

  SELECT invoice_group_id INTO v_group FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada' USING ERRCODE = 'P0002'; END IF;

  IF p_cascade_invoice_group AND v_group IS NOT NULL THEN
    SELECT array_agg(id) INTO v_roots FROM transactions WHERE invoice_group_id = v_group OR id = p_transaction_id;
  ELSE
    v_roots := ARRAY[p_transaction_id];
  END IF;

  PERFORM 1 FROM transactions WHERE id = ANY(v_roots) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM transactions WHERE id = ANY(v_roots) AND NOT public.row_belongs_to_current_company(company_id)) THEN
    RAISE EXCEPTION 'Transação de outra empresa' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_children FROM transactions WHERE parent_transaction_id = ANY(v_roots) AND NOT (id = ANY(v_roots));
  v_all := v_roots || v_children;
  v_reason := CASE WHEN array_length(v_roots, 1) > 1
    THEN coalesce(p_reason || ' · ', '') || 'Grupo fatura (' || array_length(v_roots, 1) || ' linhas IVA)'
    ELSE p_reason END;

  -- Lixo: uma entrada por raiz, com as próprias filhas.
  INSERT INTO trash (entity_type, entity_id, entity_data, related_data, deleted_by, company_id)
  SELECT 'transaction', r.id, to_jsonb(r),
         (SELECT jsonb_build_object('transactions', jsonb_agg(to_jsonb(c))) FROM transactions c WHERE c.parent_transaction_id = r.id),
         v_caller, r.company_id
    FROM transactions r WHERE r.id = ANY(v_roots);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('trash', v_n);

  UPDATE event_forecasts SET transaction_id = NULL WHERE transaction_id = ANY(v_all) AND version_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('event_forecasts', v_n);
  UPDATE event_cache_payments SET transaction_id = NULL WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('cache_payments', v_n);
  UPDATE event_cache_payments SET withholding_transaction_id = NULL WHERE withholding_transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('cache_withholding', v_n);
  UPDATE ticket_office_settlements SET transfer_transaction_id = NULL WHERE transfer_transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('settlements', v_n);
  UPDATE reimbursement_notes SET payment_transaction_id = NULL WHERE payment_transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('reimbursement_notes', v_n);

  DELETE FROM payment_list_items WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payment_list_items', v_n);
  DELETE FROM reimbursement_note_items WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('reimbursement_note_items', v_n);
  DELETE FROM partner_paid_expenses WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('partner_paid_expenses', v_n);
  DELETE FROM partner_advance_expenses WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('partner_advance_expenses', v_n);
  DELETE FROM supplier_credit_usages WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('supplier_credit_usages', v_n);
  DELETE FROM transaction_payments WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transaction_payments', v_n);
  DELETE FROM transaction_documents WHERE transaction_id = ANY(v_all);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transaction_documents', v_n);

  -- Auditoria (fica em system_audit_log; transaction_audit_log desaparece com a transação).
  FOR v_tx IN SELECT * FROM transactions WHERE id = ANY(v_all) LOOP
    INSERT INTO system_audit_log (entity_type, entity_id, action, changed_by, old_data, metadata, company_id)
    VALUES ('transaction', v_tx.id::text, 'delete', v_caller, to_jsonb(v_tx),
            jsonb_build_object('reason', v_reason, 'root', v_tx.id = ANY(v_roots), 'rpc', 'delete_transaction_cascade',
                               'invoice_group_size', array_length(v_roots, 1)),
            v_tx.company_id);
  END LOOP;

  DELETE FROM transactions WHERE id = ANY(v_children);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('children', v_n);
  DELETE FROM transactions WHERE id = ANY(v_roots);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('roots', v_n);
  IF v_n <> array_length(v_roots, 1) THEN
    RAISE EXCEPTION 'Eliminação incompleta: % de % transações' , v_n, array_length(v_roots, 1);
  END IF;

  RETURN jsonb_build_object('root_ids', to_jsonb(v_roots), 'child_ids', to_jsonb(v_children), 'counts', v_counts);
END $fn$;
REVOKE ALL ON FUNCTION public.delete_transaction_cascade(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_transaction_cascade(uuid, text, boolean, text) TO authenticated, service_role;

-- #295 (2) Estorno do fecho de bilheteira, atómico (só admin, como a RLS do UPDATE em fecho confirmado).
CREATE OR REPLACE FUNCTION public.reverse_ticket_office_settlement(p_settlement_id uuid, p_reason text, p_caller_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_s record;
  v_key text;
  v_exp uuid[];
  v_n int;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão em falta' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Só um admin pode estornar um fecho de bilheteira.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Motivo do estorno obrigatório' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_s FROM ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.row_belongs_to_current_company(v_s.company_id) THEN RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501'; END IF;
  IF v_s.status = 'reversed' THEN RAISE EXCEPTION 'Fecho já estornado' USING ERRCODE = 'P0001'; END IF;

  IF v_s.transfer_transaction_id IS NOT NULL THEN
    SELECT operation_key INTO v_key FROM transactions WHERE id = v_s.transfer_transaction_id;
    UPDATE ticket_office_settlements SET transfer_transaction_id = NULL WHERE id = p_settlement_id;
    IF v_key IS NOT NULL THEN
      DELETE FROM transactions WHERE operation_key = v_key;
    ELSE
      DELETE FROM transactions WHERE id = v_s.transfer_transaction_id;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transfer_legs', v_n);
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_exp FROM transactions WHERE settlement_id = p_settlement_id AND type = 'expense';
  DELETE FROM transaction_payments WHERE transaction_id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments', v_n);
  UPDATE transactions SET settlement_id = NULL, status = 'pending', payment_date = NULL, paid_amount = 0, account_id = NULL
   WHERE id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('expenses', v_n);

  UPDATE event_ticket_office_advances SET settlement_id = NULL WHERE settlement_id = p_settlement_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('advances', v_n);

  UPDATE ticket_office_settlements SET status = 'reversed', reversed_at = now(), reversed_by = v_uid,
         reversal_reason = p_reason, transfer_transaction_id = NULL, net_transferred = 0, transfer_account_id = NULL
   WHERE id = p_settlement_id;

  UPDATE event_ticket_office_assignments SET is_conciliated = false, conciliated_at = NULL, conciliated_by = NULL
   WHERE event_id = v_s.event_id AND financial_account_id = v_s.financial_account_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('assignments', v_n);

  INSERT INTO system_audit_log (entity_type, entity_id, action, changed_by, metadata, company_id)
  VALUES ('ticket_office_settlement', p_settlement_id::text, 'reverse', coalesce(nullif(trim(p_caller_name), ''), v_uid::text),
          jsonb_build_object('reason', p_reason, 'counts', v_counts), v_s.company_id);

  RETURN jsonb_build_object('settlement_id', p_settlement_id, 'counts', v_counts);
END $fn$;
REVOKE ALL ON FUNCTION public.reverse_ticket_office_settlement(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_ticket_office_settlement(uuid, text, text) TO authenticated, service_role;

-- #246 amount de linhas overhead/excluídas/adoptadas/retroactivas com observação.
CREATE OR REPLACE FUNCTION public.set_forecast_amount_observed(_forecast_id uuid, _amount numeric, _observation text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão em falta' USING ERRCODE = '42501'; END IF;
  SELECT id, company_id, amount INTO v_row FROM event_forecasts WHERE id = _forecast_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha de BP não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.row_belongs_to_current_company(v_row.company_id) THEN RAISE EXCEPTION 'Linha de outra empresa' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_platform_admin() OR public.has_permission_in(v_uid, 'manage_bp', v_row.company_id)) THEN
    RAISE EXCEPTION 'Sem permissão para editar o BP (manage_bp).' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '22023'; END IF;

  PERFORM set_config('mp.bp_change_observation', coalesce(trim(_observation), ''), true);
  UPDATE event_forecasts SET amount = _amount, updated_at = now() WHERE id = _forecast_id;
  PERFORM set_config('mp.bp_change_observation', '', true);
  RETURN jsonb_build_object('id', _forecast_id, 'old_amount', v_row.amount, 'new_amount', _amount);
END $fn$;
REVOKE ALL ON FUNCTION public.set_forecast_amount_observed(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_forecast_amount_observed(uuid, numeric, text) TO authenticated, service_role;

-- #150 invariante maes_rateio_divergentes.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH m AS (
    SELECT p.id, p.description, p.amount, sum(ch.amount) AS soma, count(*) AS filhas
      FROM public.transactions p
      JOIN public.transactions ch ON ch.parent_transaction_id = p.id AND ch.split_percentage IS NOT NULL
     GROUP BY p.id, p.description, p.amount
    HAVING abs(p.amount - sum(ch.amount)) > 0.01
  )
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', id, 'descricao', description, 'mae', amount, 'filhas', soma, 'n', filhas, 'diff', amount - soma) ORDER BY abs(amount - soma) DESC) FILTER (WHERE true), '[]'::jsonb)
    INTO c, s FROM m;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'maes_rateio_divergentes';
END $function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('maes_rateio_divergentes',
  'Mães de rateio (filhas com split_percentage) cuja soma das filhas difere do amount da mãe em mais de 0,01 €. Parcelas (sem split_percentage) ficam de fora.',
  'warn', 'global', 3,
  '#150 — referência 10/10/2026: 3 mães com diferença de arredondamento (0,02–0,04 €). Opção (A) trigger por decidir pelo Pedro (D-ERP219).')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
  UNION ALL SELECT * FROM public._run_invariant_checks_rateio()
$function$;
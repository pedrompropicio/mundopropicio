-- Issue #346 (R2, D-ERP291): ligar um adiantamento livre a um contrato de cachê existente, no lugar.
-- Só funções, invariante e ACL. Não liga nenhum adiantamento (a ligação real faz-se no ecrã).
CREATE OR REPLACE FUNCTION public.attach_cache_advance_to_contract(p_contract_id uuid, p_advance_tx_id uuid, p_confirm_beneficiary boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._cache_assert_actor();
  v_c public.cache_payment_contracts%ROWTYPE;
  v_a public.transactions%ROWTYPE;
  v_m public.transactions%ROWTYPE;
  v_k public.transactions%ROWTYPE;
  r record; f record;
  v_total numeric := 0; v_new numeric; v_by text; v_ben text; v_sup text;
  v_cities jsonb := '[]'::jsonb; v_deleted uuid[] := '{}'; v_fcs uuid[] := '{}';
  v_first uuid; v_acc numeric := 0; v_next uuid; v_mnew numeric;
BEGIN
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id;
  IF NOT FOUND OR v_c.company_id <> public.current_company_id() THEN RAISE EXCEPTION 'contrato_inexistente: escolha um contrato'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_c.root_event_id || ':' || v_c.artist_supplier_id, 0));
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id FOR UPDATE;
  SELECT * INTO v_a FROM public.transactions WHERE id = p_advance_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adiantamento_inexistente'; END IF;
  IF v_a.company_id <> v_c.company_id THEN RAISE EXCEPTION 'empresa_diferente: o adiantamento é de outra empresa'; END IF;
  -- Idempotência: já ligado a este contrato.
  IF v_a.cache_contract_id = v_c.id AND v_a.cache_role = 'advance' THEN
    RETURN jsonb_build_object('already_attached', true, 'contract_id', v_c.id, 'advance_id', v_a.id);
  END IF;
  IF v_c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_cancelado'; END IF;
  IF v_a.cache_contract_id IS NOT NULL THEN RAISE EXCEPTION 'adiantamento_ja_associado: o adiantamento já pertence a outro contrato'; END IF;
  IF v_a.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'adiantamento_estornado: o adiantamento foi estornado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public._cache_free_advances(v_c.root_event_id, v_c.artist_supplier_id) fa WHERE fa.tx_id = v_a.id) THEN
    RAISE EXCEPTION 'adiantamento_invalido: só adiantamentos livres deste cachê (mesmo artista e turnê/evento, não lançados no Master)';
  END IF;
  IF v_c.artist_mother_id IS NULL THEN RAISE EXCEPTION 'sem_mae_saldo: o saldo deste contrato já é zero'; END IF;
  IF v_a.supplier_id IS DISTINCT FROM v_c.beneficiary_supplier_id AND NOT coalesce(p_confirm_beneficiary, false) THEN
    SELECT name INTO v_ben FROM public.suppliers WHERE id = v_c.beneficiary_supplier_id;
    SELECT name INTO v_sup FROM public.suppliers WHERE id = v_a.supplier_id;
    RAISE EXCEPTION 'beneficiario_diferente: beneficiário do contrato % ≠ fornecedor do adiantamento %', coalesce(v_ben,'?'), coalesce(v_sup,'?');
  END IF;
  SELECT * INTO v_m FROM public.transactions WHERE id = v_c.artist_mother_id FOR UPDATE;
  PERFORM 1 FROM public.transactions WHERE parent_transaction_id = v_m.id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id = li.payment_list_id
              WHERE li.removed_at IS NULL AND pl.status <> 'rejected'
                AND (li.transaction_id = v_m.id OR li.transaction_id IN (SELECT id FROM public.transactions WHERE parent_transaction_id = v_m.id))) THEN
    RAISE EXCEPTION 'saldo_em_lista: o saldo deste contrato está numa lista de pagamento; retire-o da lista primeiro';
  END IF;
  -- Validação por cidade (antes de alterar).
  FOR r IN SELECT fa.event_id, sum(fa.amount) AS amt FROM public._cache_free_advances(v_c.root_event_id, v_c.artist_supplier_id) fa
            WHERE fa.tx_id = v_a.id GROUP BY fa.event_id ORDER BY fa.event_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cache_payment_contract_cities WHERE contract_id = v_c.id AND event_id = r.event_id) THEN
      RAISE EXCEPTION 'cidade_fora_do_contrato: a cidade do adiantamento não faz parte deste contrato';
    END IF;
    SELECT * INTO v_k FROM public.transactions WHERE parent_transaction_id = v_m.id AND event_id = r.event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'saldo_negativo: a cidade já não tem saldo neste contrato'; END IF;
    v_new := v_k.amount - r.amt;
    IF v_new < -0.005 THEN RAISE EXCEPTION 'saldo_negativo: o adiantamento % excede o saldo % da cidade', r.amt, v_k.amount; END IF;
    IF v_new < v_k.paid_amount - 0.005
       OR v_new < coalesce((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.transaction_id = v_k.id), 0) - 0.005 THEN
      RAISE EXCEPTION 'saldo_abaixo_do_pago: o saldo da cidade ficaria abaixo do já pago';
    END IF;
    v_total := v_total + r.amt;
  END LOOP;
  v_mnew := v_m.amount - v_total;
  IF v_mnew < v_m.paid_amount - 0.005 THEN RAISE EXCEPTION 'saldo_abaixo_do_pago: o saldo do contrato ficaria abaixo do já pago'; END IF;
  SELECT coalesce(email, v_uid::text) INTO v_by FROM auth.users WHERE id = v_uid;
  -- Alterações por cidade.
  FOR r IN SELECT fa.event_id, sum(fa.amount) AS amt FROM public._cache_free_advances(v_c.root_event_id, v_c.artist_supplier_id) fa
            WHERE fa.tx_id = v_a.id GROUP BY fa.event_id ORDER BY fa.event_id LOOP
    SELECT * INTO v_k FROM public.transactions WHERE parent_transaction_id = v_m.id AND event_id = r.event_id;
    v_new := round(v_k.amount - r.amt, 2);
    v_cities := v_cities || jsonb_build_object('event_id', r.event_id, 'amount', r.amt, 'balance_before', v_k.amount, 'balance_after', greatest(v_new,0));
    IF v_new <= 0.005 THEN v_deleted := v_deleted || v_k.id;
    ELSE UPDATE public.transactions SET amount = v_new WHERE id = v_k.id; END IF;
    UPDATE public.cache_payment_contract_cities SET advances = advances + r.amt, artist_balance = artist_balance - r.amt
     WHERE contract_id = v_c.id AND event_id = r.event_id;
  END LOOP;
  IF v_mnew <= 0.005 THEN
    SELECT v_deleted || coalesce(array_agg(id), '{}') INTO v_deleted FROM public.transactions
     WHERE (parent_transaction_id = v_m.id AND NOT (id = ANY(v_deleted))) OR id = v_m.id;
  END IF;
  IF array_length(v_deleted, 1) > 0 THEN
    SELECT coalesce(array_agg(id), '{}') INTO v_fcs FROM public.event_forecasts WHERE transaction_id = ANY(v_deleted) AND version_id IS NULL;
    UPDATE public.event_forecasts SET transaction_id = NULL WHERE transaction_id = ANY(v_deleted) AND version_id IS NULL;
    DELETE FROM public.transaction_documents WHERE transaction_id = ANY(v_deleted);
    FOR v_k IN SELECT * FROM public.transactions WHERE id = ANY(v_deleted) LOOP
      INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, metadata, company_id)
      VALUES ('transaction', v_k.id::text, 'delete', coalesce(v_by, v_uid::text), to_jsonb(v_k),
              jsonb_build_object('reason', 'saldo zerado por adiantamento ligado', 'rpc', 'attach_cache_advance_to_contract',
                                 'cache_contract_id', v_c.id, 'advance_id', v_a.id), v_k.company_id);
    END LOOP;
    DELETE FROM public.transactions WHERE id = ANY(v_deleted) AND parent_transaction_id IS NOT NULL;
    DELETE FROM public.transactions WHERE id = ANY(v_deleted);
  END IF;
  IF v_mnew <= 0.005 THEN
    UPDATE public.cache_payment_contracts SET artist_mother_id = NULL, advances_amount = advances_amount + v_total WHERE id = v_c.id;
  ELSE
    UPDATE public.transactions SET amount = round(v_mnew, 2) WHERE id = v_m.id;
    -- Percentagens das filhas de saldo: regra da criação (4 casas; a maior fica com 100 − soma).
    SELECT id INTO v_first FROM public.transactions WHERE parent_transaction_id = v_m.id ORDER BY amount DESC, event_id LIMIT 1;
    SELECT coalesce(sum(round(amount / v_mnew * 100, 4)), 0) INTO v_acc FROM public.transactions
     WHERE parent_transaction_id = v_m.id AND id <> v_first;
    UPDATE public.transactions SET split_percentage = CASE WHEN id = v_first THEN 100 - v_acc ELSE round(amount / v_mnew * 100, 4) END
     WHERE parent_transaction_id = v_m.id;
    UPDATE public.cache_payment_contracts SET advances_amount = advances_amount + v_total WHERE id = v_c.id;
  END IF;
  -- O adiantamento passa a pertencer ao contrato (mesmo UPDATE que _cache_create_contract faz).
  UPDATE public.transactions SET cache_contract_id = v_c.id, cache_role = 'advance',
         cache_root_event_id = v_c.root_event_id, cache_artist_supplier_id = v_c.artist_supplier_id
   WHERE id = v_a.id OR parent_transaction_id = v_a.id;
  -- Re-âncora das linhas cujo alvo foi apagado (regra da 0217).
  FOR f IN SELECT id, company_id, event_id FROM public.event_forecasts WHERE id = ANY(v_fcs) AND version_id IS NULL FOR UPDATE LOOP
    SELECT t.id INTO v_next FROM public.transactions t
     WHERE t.forecast_id = f.id AND public.bp_tx_link_allowed(t.event_id, t.company_id, f.event_id, f.company_id)
     ORDER BY t.date, t.created_at, t.id LIMIT 1;
    UPDATE public.event_forecasts SET transaction_id = v_next WHERE id = f.id AND transaction_id IS NULL;
    v_next := NULL;
  END LOOP;
  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
  VALUES ('cache_payment_contract', v_c.id::text, 'cache_advance_attached', coalesce(v_by, v_uid::text),
          jsonb_build_object('advances_amount', v_c.advances_amount, 'artist_mother_amount', v_m.amount),
          jsonb_build_object('advances_amount', v_c.advances_amount + v_total, 'artist_mother_amount', greatest(round(v_mnew,2),0)),
          jsonb_build_object('rpc', 'attach_cache_advance_to_contract', 'advance_id', v_a.id, 'amount', v_total, 'cities', v_cities,
                             'beneficiary_confirmed', v_a.supplier_id IS DISTINCT FROM v_c.beneficiary_supplier_id,
                             'advance_supplier_id', v_a.supplier_id, 'beneficiary_supplier_id', v_c.beneficiary_supplier_id),
          v_c.company_id);
  RETURN jsonb_build_object('already_attached', false, 'contract_id', v_c.id, 'advance_id', v_a.id, 'amount', v_total,
                            'cities', v_cities, 'contract_advances_after', v_c.advances_amount + v_total,
                            'artist_mother_after', greatest(round(v_mnew,2),0));
END $function$;

REVOKE ALL ON FUNCTION public.attach_cache_advance_to_contract(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_cache_advance_to_contract(uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cache_contract_context(p_event_id uuid, p_artist_supplier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_root uuid; v_company uuid; v_out jsonb;
BEGIN
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR auth.uid() IS NULL OR NOT (v_company = public.current_company_id() OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'evento_inexistente';
  END IF;
  WITH c AS (SELECT * FROM public._cache_cities(v_root, p_artist_supplier_id)),
  rows_ AS (
    SELECT t.event_id, coalesce(t.cache_role, p.cache_role, 'sem_papel') AS role, t.amount, t.paid_amount
      FROM public.transactions t JOIN c ON c.forecast_id = t.forecast_id
      LEFT JOIN public.transactions p ON p.id = t.parent_transaction_id
     WHERE t.type = 'expense' AND t.reversed_at IS NULL AND COALESCE(t.is_hidden,false) = false
       AND t.status IN ('approved','paid')
  )
  SELECT jsonb_build_object(
    'root_event_id', v_root,
    'max_contracts', public.cache_max_contracts(),
    'master_line_warning', EXISTS (
       SELECT 1 FROM public.event_forecasts f JOIN public.event_cache_configs cc ON cc.id = f.cache_config_id
        WHERE f.event_id = v_root AND f.formula_type = 'cache_module' AND f.version_id IS NULL AND cc.supplier_id = p_artist_supplier_id
          AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = v_root)),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', c.event_id, 'name', c.event_name, 'date', c.event_date,
        'forecast_id', c.forecast_id, 'cap', c.cap, 'is_absorber', c.is_absorber,
        'by_role', (SELECT coalesce(jsonb_object_agg(role, jsonb_build_object('amount', a, 'paid', pd)), '{}'::jsonb)
                      FROM (SELECT role, sum(amount) a, sum(paid_amount) pd FROM rows_ r WHERE r.event_id = c.event_id GROUP BY role) z)
      ) ORDER BY c.idx) FROM c), '[]'::jsonb),
    'contracts', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'label', k.label, 'gross', k.gross, 'beneficiary_supplier_id', k.beneficiary_supplier_id,
        'beneficiary_name', (SELECT name FROM public.suppliers s WHERE s.id = k.beneficiary_supplier_id),
        'withholding_applies', k.withholding_applies, 'withholding_rate', k.withholding_rate, 'withholding_amount', k.withholding_amount,
        'withholding_due_date', k.withholding_due_date, 'artist_due_date', k.artist_due_date, 'advances_amount', k.advances_amount,
        'created_at', k.created_at,
        'artist_mother', (SELECT jsonb_build_object('id', t.id, 'amount', t.amount, 'paid', t.paid_amount, 'status', t.status) FROM public.transactions t WHERE t.id = k.artist_mother_id),
        'withholding_mother', (SELECT jsonb_build_object('id', t.id, 'amount', t.amount, 'paid', t.paid_amount, 'status', t.status) FROM public.transactions t WHERE t.id = k.withholding_mother_id),
        'has_payment', EXISTS (SELECT 1 FROM public.transactions t WHERE t.id IN (k.artist_mother_id, k.withholding_mother_id) AND (t.paid_amount > 0 OR t.status='paid'))
                    OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id IN (k.artist_mother_id, k.withholding_mother_id))
                    OR EXISTS (SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id = li.payment_list_id
                                WHERE li.transaction_id IN (k.artist_mother_id, k.withholding_mother_id) AND li.removed_at IS NULL AND pl.status IN ('approved','partially_approved')),
        'advance_ids', (SELECT coalesce(jsonb_agg(t.id), '[]'::jsonb) FROM public.transactions t WHERE t.cache_contract_id = k.id AND t.cache_role = 'advance' AND t.parent_transaction_id IS NULL),
        'cities', (SELECT jsonb_agg(jsonb_build_object('event_id', cc.event_id, 'quota', cc.quota, 'withholding', cc.withholding,
                    'advances', cc.advances, 'artist_balance', cc.artist_balance) ORDER BY cc.event_id) FROM public.cache_payment_contract_cities cc WHERE cc.contract_id = k.id)
      ) ORDER BY k.created_at) FROM public.cache_payment_contracts k
      WHERE k.root_event_id = v_root AND k.artist_supplier_id = p_artist_supplier_id AND k.cancelled_at IS NULL), '[]'::jsonb),
    'free_advances', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.tx_id, 'amount', g.amt, 'legacy', g.legacy,
        'description', (SELECT description FROM public.transactions WHERE id = g.tx_id),
        'paid', (SELECT paid_amount FROM public.transactions WHERE id = g.tx_id), 'by_city', g.by_city,
        'supplier_id', (SELECT supplier_id FROM public.transactions WHERE id = g.tx_id),
        'supplier_name', (SELECT s.name FROM public.transactions t JOIN public.suppliers s ON s.id = t.supplier_id WHERE t.id = g.tx_id)))
      FROM (SELECT fa.tx_id, bool_or(fa.legacy) legacy, sum(fa.amount) amt, jsonb_object_agg(fa.event_id, fa.amount) by_city
              FROM public._cache_free_advances(v_root, p_artist_supplier_id) fa GROUP BY fa.tx_id) g), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $function$;

INSERT INTO public.system_invariants(name, description, severity, scope, reference_count, notes)
VALUES ('cache_cidade_teto_excedido', 'Quotas dos contratos ativos + adiantamentos livres de uma cidade acima do teto da cidade', 'error', 'global', 0, 'Issue #346')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c1 bigint; s1 jsonb; c2 bigint; s2 jsonb; c3 bigint; s3 jsonb; c4 bigint := 0; s4 jsonb := '[]'::jsonb; p record; q record;
BEGIN
  WITH got AS (
    SELECT cc.contract_id, cc.event_id, cc.quota,
           coalesce((SELECT sum(t.amount) FROM public.transactions t
                      WHERE t.cache_contract_id = cc.contract_id AND t.event_id = cc.event_id AND t.reversed_at IS NULL
                        AND (t.parent_transaction_id IS NOT NULL OR t.cache_role = 'advance')),0) AS soma
      FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE k.cancelled_at IS NULL
  ), bad AS (SELECT * FROM got WHERE abs(quota - soma) > 0.01)
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c1, s1 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c1, i.reference_count, c1 <= i.reference_count, i.notes, s1
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_cidade_divergente';

  WITH bad AS (SELECT root_event_id, artist_supplier_id, count(*) n FROM public.cache_payment_contracts
                WHERE cancelled_at IS NULL GROUP BY 1,2 HAVING count(*) > public.cache_max_contracts())
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(bad)), '[]'::jsonb) INTO c2, s2 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c2, i.reference_count, c2 <= i.reference_count, i.notes, s2
    FROM public.system_invariants i WHERE i.name = 'cache_contratos_acima_limite';

  WITH bad AS (
    SELECT t.id, t.event_id, t.forecast_id FROM public.transactions t
     WHERE t.cache_role IS NOT NULL AND t.cache_contract_id IS NOT NULL AND (
       (t.parent_transaction_id IS NULL AND t.cache_role <> 'advance' AND (t.event_id IS NOT NULL OR t.forecast_id IS NOT NULL))
       OR (t.parent_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = t.event_id))
       OR t.declared_withholding_amount IS NOT NULL OR t.iva_rate <> 0)
  )
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c3, s3 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c3, i.reference_count, c3 <= i.reference_count, i.notes, s3
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_estrutura_invalida';
  -- cache_cidade_teto_excedido: quotas dos contratos ativos + adiantamentos livres por cidade ≤ teto da cidade.
  FOR p IN SELECT DISTINCT root_event_id, artist_supplier_id FROM public.cache_payment_contracts WHERE cancelled_at IS NULL LOOP
    BEGIN
      FOR q IN
        WITH caps AS (
          SELECT cc.event_id, max(cc.cap) AS cap, sum(cc.quota) AS quota
            FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
           WHERE k.cancelled_at IS NULL AND k.root_event_id = p.root_event_id AND k.artist_supplier_id = p.artist_supplier_id
           GROUP BY cc.event_id
        ), fa AS (
          SELECT x.event_id, sum(x.amount) AS amt FROM public._cache_free_advances_x(p.root_event_id, p.artist_supplier_id, NULL) x GROUP BY x.event_id
        )
        SELECT caps.event_id, caps.cap, caps.quota, coalesce(fa.amt, 0) AS free_advances
          FROM caps LEFT JOIN fa ON fa.event_id = caps.event_id
         WHERE caps.quota + coalesce(fa.amt, 0) > caps.cap + 0.005
      LOOP
        c4 := c4 + 1;
        IF jsonb_array_length(s4) < 6 THEN
          s4 := s4 || jsonb_build_object('root_event_id', p.root_event_id, 'artist_supplier_id', p.artist_supplier_id,
                                         'event_id', q.event_id, 'cap', q.cap, 'quota', q.quota, 'free_advances', q.free_advances);
        END IF;
      END LOOP;
    EXCEPTION WHEN others THEN
      c4 := c4 + 1;
      IF jsonb_array_length(s4) < 6 THEN
        s4 := s4 || jsonb_build_object('root_event_id', p.root_event_id, 'artist_supplier_id', p.artist_supplier_id, 'erro', SQLERRM);
      END IF;
    END;
  END LOOP;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c4, i.reference_count, c4 <= i.reference_count, i.notes, s4
    FROM public.system_invariants i WHERE i.name = 'cache_cidade_teto_excedido';
END $function$;
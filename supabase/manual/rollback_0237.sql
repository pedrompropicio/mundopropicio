-- Rollback da 0237 (Issue #346). NÃO aplicado. Repõe os corpos de Live de 23/10/2026 byte a byte.
-- Ligações já feitas não se desfazem aqui: desligam-se com "Alterar" do contrato.
DROP FUNCTION IF EXISTS public.attach_cache_advance_to_contract(uuid, uuid, boolean);

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
        'paid', (SELECT paid_amount FROM public.transactions WHERE id = g.tx_id), 'by_city', g.by_city))
      FROM (SELECT fa.tx_id, bool_or(fa.legacy) legacy, sum(fa.amount) amt, jsonb_object_agg(fa.event_id, fa.amount) by_city
              FROM public._cache_free_advances(v_root, p_artist_supplier_id) fa GROUP BY fa.tx_id) g), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c1 bigint; s1 jsonb; c2 bigint; s2 jsonb; c3 bigint; s3 jsonb;
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
END $function$;

DELETE FROM public.system_invariants WHERE name = 'cache_cidade_teto_excedido';

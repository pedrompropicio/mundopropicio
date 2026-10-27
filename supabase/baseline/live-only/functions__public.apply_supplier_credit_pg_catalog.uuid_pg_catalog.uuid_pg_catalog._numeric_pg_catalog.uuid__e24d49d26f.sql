-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.apply_supplier_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog."numeric",pg_catalog.uuid)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "21856cd07aee4b1e114b7ee0e4aa6c42217a1f63fca2bc8fcf284f96f3b57caf", "live_properties_sha256": "23e488a7e7a1638a739cae4d781abd446db56902fbbe344bc4bcbb9e09118c34", "oid": 178685, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "d36f7b749e28a17332037024c9e50bf44511289d9a4d52374948e07d3f8f7f1c", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8bb5241cc7a777f86c39b29ccc83ecedebab59152761df85f6a75cfde262f957
CREATE OR REPLACE FUNCTION public.apply_supplier_credit(p_credit_id uuid, p_transaction_id uuid, p_amount numeric, p_payment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_credit public.supplier_credits%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_remaining numeric;
  v_new_used numeric;
  v_usage_id uuid;
  v_actor text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), 'sistema');
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied: apenas admin ou manager podem abater créditos';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: valor a abater deve ser positivo';
  END IF;

  SELECT * INTO v_credit FROM public.supplier_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_not_found: %', p_credit_id;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found: %', p_transaction_id;
  END IF;

  IF v_tx.supplier_id IS DISTINCT FROM v_credit.supplier_id THEN
    RAISE EXCEPTION 'supplier_mismatch: o crédito pertence a outro fornecedor';
  END IF;

  IF v_credit.valid_until IS NOT NULL AND v_credit.valid_until < current_date THEN
    UPDATE public.supplier_credits SET status = 'expired', updated_at = now() WHERE id = p_credit_id;
    RAISE EXCEPTION 'credit_expired: crédito expirou em %', v_credit.valid_until;
  END IF;

  IF v_credit.status <> 'active' THEN
    RAISE EXCEPTION 'credit_not_active: estado atual %', v_credit.status;
  END IF;

  v_remaining := round((v_credit.amount - v_credit.used_amount)::numeric, 2);
  IF p_amount > v_remaining + 0.01 THEN
    RAISE EXCEPTION 'insufficient_credit: saldo disponível % (pedido %)', v_remaining, p_amount;
  END IF;

  INSERT INTO public.supplier_credit_usages (credit_id, transaction_id, amount, used_by, company_id, notes)
  VALUES (
    p_credit_id,
    p_transaction_id,
    p_amount,
    v_actor,
    v_credit.company_id,
    CASE WHEN p_payment_id IS NOT NULL THEN 'payment:' || p_payment_id::text ELSE NULL END
  )
  RETURNING id INTO v_usage_id;

  v_new_used := round((v_credit.used_amount + p_amount)::numeric, 2);
  UPDATE public.supplier_credits
     SET used_amount = v_new_used,
         status = CASE WHEN v_new_used >= v_credit.amount - 0.01 THEN 'exhausted' ELSE 'active' END,
         updated_at = now()
   WHERE id = p_credit_id;

  IF p_payment_id IS NOT NULL THEN
    UPDATE public.transaction_payments
       SET credit_amount = coalesce(credit_amount, 0) + p_amount,
           updated_at = now()
     WHERE id = p_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, metadata)
    VALUES (
      'supplier_credit', p_credit_id::text, 'apply_supplier_credit', v_actor,
      jsonb_build_object('amount', p_amount, 'usage_id', v_usage_id, 'new_used_amount', v_new_used),
      jsonb_build_object('transaction_id', p_transaction_id, 'payment_id', p_payment_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'usage_id', v_usage_id,
    'credit_id', p_credit_id,
    'applied', p_amount,
    'remaining', round((v_credit.amount - v_new_used)::numeric, 2)
  );
END;
$function$
;

ALTER FUNCTION public.apply_supplier_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog."numeric",pg_catalog.uuid) OWNER TO "postgres";
-- END OPERATION 8bb5241cc7a777f86c39b29ccc83ecedebab59152761df85f6a75cfde262f957

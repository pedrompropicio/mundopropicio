-- P3 passo 3. PREPARADO, NÃO APLICADO. Sem BEGIN/COMMIT:
-- aplicação futura exclusivamente numa transação gerida pela ferramenta.
-- Helpers privados: não são endpoints; apenas as cinco RPCs têm EXECUTE externo.
CREATE OR REPLACE FUNCTION public._partner_contract_share(_participant_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.event_settlement_participants; s public.event_settlements; v numeric;
BEGIN
  IF auth.uid() IS NULL OR public.current_company_id() IS NULL OR NOT coalesce(
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_permission(auth.uid(),'manage_bp'),false) THEN
    RAISE EXCEPTION 'Sem permissão para contratos de sócios' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.event_settlement_participants WHERE id=_participant_id FOR UPDATE;
  IF p.id IS NULL OR p.company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'participante_invalido';
  END IF;
  SELECT * INTO s FROM public.event_settlements WHERE id=p.settlement_id FOR UPDATE;
  IF s.id IS NULL OR s.company_id IS DISTINCT FROM p.company_id THEN RAISE EXCEPTION 'fechamento_invalido'; END IF;
  IF p.mode IS DISTINCT FROM 'settles' OR p.frozen_at IS NULL THEN RAISE EXCEPTION 'socio_nao_congelado'; END IF;
  IF coalesce(s.is_sealed,false) THEN RAISE EXCEPTION 'fechamento_selado'; END IF;
  IF jsonb_typeof(p.frozen_values) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p.frozen_values->'share_amount') NOT IN ('number','string')
     OR p.frozen_values->>'share_amount' IS NULL THEN RAISE EXCEPTION 'parte_congelada_em_falta'; END IF;
  BEGIN v := (p.frozen_values->>'share_amount')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'parte_congelada_invalida'; END;
  IF v IS NULL OR v::text IN ('NaN','Infinity','-Infinity') OR v<0 OR v<>round(v,2) THEN
    RAISE EXCEPTION 'parte_congelada_invalida';
  END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public._partner_contract_assert_unpaid(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1 FROM public.transactions WHERE id=ANY(_ids) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.transactions WHERE id=ANY(_ids) AND
      (coalesce(paid_amount,0)>0 OR status='paid' OR payment_date IS NOT NULL OR reversed_at IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=ANY(_ids))
    OR EXISTS(SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id=li.payment_list_id
      WHERE li.transaction_id=ANY(_ids) AND li.removed_at IS NULL AND pl.status IN ('approved','partially_approved')) THEN
    RAISE EXCEPTION 'contrato_com_pagamento: estorne primeiro pelos fluxos normais';
  END IF;
  IF EXISTS(SELECT 1 FROM public.bank_line_transactions WHERE transaction_id=ANY(_ids))
    OR EXISTS(SELECT 1 FROM public.bank_statement_lines WHERE matched_transaction_id=ANY(_ids) OR created_transaction_id=ANY(_ids)) THEN
    RAISE EXCEPTION 'contrato_conciliado';
  END IF;
  -- Inclui o histórico revertido: não apagar provas nem contornar issue335_guard.
  IF EXISTS(SELECT 1 FROM public.transaction_offsets WHERE receivable_transaction_id=ANY(_ids) OR payable_transaction_id=ANY(_ids))
    OR EXISTS(SELECT 1 FROM public.transaction_offset_items WHERE transaction_id=ANY(_ids)) THEN
    RAISE EXCEPTION 'contrato_em_encontro_de_contas';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public._partner_contract_advance(_participant_id uuid, _tx_id uuid, _beneficiary uuid, _confirm boolean)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.event_settlement_participants; t public.transactions;
BEGIN
  SELECT * INTO p FROM public.event_settlement_participants WHERE id=_participant_id;
  SELECT * INTO t FROM public.transactions WHERE id=_tx_id FOR UPDATE;
  IF t.id IS NULL OR t.company_id IS DISTINCT FROM p.company_id OR t.event_id IS DISTINCT FROM p.event_id
    OR t.supplier_id IS DISTINCT FROM p.supplier_id OR t.type IS DISTINCT FROM 'expense'
    OR t.partner_contract_id IS NOT NULL OR t.partner_contract_role IS NOT NULL
    OR t.parent_transaction_id IS NOT NULL OR t.cache_contract_id IS NOT NULL OR t.invoice_group_id IS NOT NULL
    OR t.reversed_at IS NOT NULL OR t.amount IS NULL OR t.amount<=0 OR t.amount<>round(t.amount,2)
    OR coalesce(t.iva_rate,0)<>0 OR coalesce(t.currency,'EUR')<>'EUR'
    OR NOT EXISTS(SELECT 1 FROM public.account_categories WHERE id=t.category_id AND company_id=p.company_id AND code='10.1.03')
    OR EXISTS(SELECT 1 FROM public.transactions WHERE parent_transaction_id=t.id)
    THEN RAISE EXCEPTION 'adiantamento_invalido: só livre, indivisível, do sócio e evento'; END IF;
  IF t.supplier_id IS DISTINCT FROM _beneficiary AND NOT coalesce(_confirm,false) THEN
    RAISE EXCEPTION 'beneficiario_diferente: confirme explicitamente';
  END IF;
  IF EXISTS(SELECT 1 FROM public.transaction_offsets WHERE receivable_transaction_id=t.id OR payable_transaction_id=t.id)
    OR EXISTS(SELECT 1 FROM public.transaction_offset_items WHERE transaction_id=t.id) THEN
    RAISE EXCEPTION 'adiantamento_em_encontro_de_contas';
  END IF;
  RETURN t.amount;
END $function$;

CREATE OR REPLACE FUNCTION public.create_partner_payment_contract(
  _participant_id uuid, _beneficiary uuid, _gross numeric, _wh_applies boolean,
  _wh_rate numeric, _wh_due date, _due date, _advance_ids uuid[] DEFAULT '{}'::uuid[],
  _label text DEFAULT NULL, _key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.event_settlement_participants; c public.partner_payment_contracts;
  share numeric; wh numeric:=0; adv numeric:=0; cat uuid; at_supplier uuid; cid uuid; bid uuid; wid uuid;
  ids uuid[]; aid uuid; n integer; used numeric; today date:=(now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  share := public._partner_contract_share(_participant_id);
  SELECT * INTO p FROM public.event_settlement_participants WHERE id=_participant_id;
  IF _wh_applies IS NULL THEN RAISE EXCEPTION 'retencao_sem_resposta'; END IF;
  IF _gross IS NULL OR _gross::text IN ('NaN','Infinity','-Infinity') OR _gross<=0 OR _gross<>round(_gross,2) THEN
    RAISE EXCEPTION 'bruto_invalido'; END IF;
  IF _due IS NULL THEN RAISE EXCEPTION 'vencimento_obrigatorio'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=_beneficiary AND company_id=p.company_id) THEN RAISE EXCEPTION 'beneficiario_invalido'; END IF;
  IF _wh_applies THEN
    IF _wh_rate IS NULL OR _wh_rate::text IN ('NaN','Infinity','-Infinity') OR _wh_rate<=0 OR _wh_rate>=100
      OR _wh_rate<>round(_wh_rate,2) OR _wh_due IS NULL THEN RAISE EXCEPTION 'retencao_invalida'; END IF;
    wh := round(_gross*_wh_rate/100,2);
  ELSIF _wh_rate IS NOT NULL OR _wh_due IS NOT NULL THEN RAISE EXCEPTION 'retencao_nao_sem_parametros'; END IF;
  ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_advance_ids,'{}'::uuid[])) x ORDER BY x);
  IF array_position(ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'adiantamento_inexistente'; END IF;
  IF _key IS NOT NULL THEN
    IF btrim(_key)='' THEN RAISE EXCEPTION 'chave_invalida'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('partner-contract-key:'||p.company_id||':'||_key,0));
    SELECT * INTO c FROM public.partner_payment_contracts WHERE company_id=p.company_id AND idempotency_key=_key;
    IF c.id IS NOT NULL THEN
      IF c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'chave_de_contrato_cancelado'; END IF;
      IF (c.participant_id,c.beneficiary_supplier_id,c.gross,c.withholding_applies,c.withholding_rate,c.withholding_due_date,c.due_date,c.label)
        IS DISTINCT FROM (_participant_id,_beneficiary,_gross,_wh_applies,_wh_rate,_wh_due,_due,nullif(btrim(_label),''))
        OR ids IS DISTINCT FROM ARRAY(SELECT id FROM public.transactions WHERE partner_contract_id=c.id AND partner_contract_role='advance' ORDER BY id)
        THEN RAISE EXCEPTION 'idempotency_key_conflito'; END IF;
      RETURN c.id;
    END IF;
  END IF;
  SELECT count(*),coalesce(sum(gross),0) INTO n,used FROM public.partner_payment_contracts
    WHERE participant_id=p.id AND cancelled_at IS NULL;
  IF n>=4 THEN RAISE EXCEPTION 'limite_contratos: máximo 4'; END IF;
  IF used+_gross>share THEN RAISE EXCEPTION 'parte_excedida'; END IF;
  FOREACH aid IN ARRAY ids LOOP
    adv := adv+public._partner_contract_advance(p.id,aid,_beneficiary,false);
  END LOOP;
  IF wh+adv>_gross THEN RAISE EXCEPTION 'saldo_negativo'; END IF;
  SELECT id INTO cat FROM public.account_categories WHERE company_id=p.company_id AND code='10.1.03';
  IF cat IS NULL THEN RAISE EXCEPTION 'categoria_em_falta'; END IF;
  IF _wh_applies THEN
    SELECT id INTO at_supplier FROM public.suppliers WHERE company_id=p.company_id AND name='MINISTERIO DAS FINANCAS - IRS' ORDER BY id LIMIT 1;
    IF at_supplier IS NULL THEN RAISE EXCEPTION 'fornecedor_at_em_falta'; END IF;
  END IF;
  PERFORM set_config('app.partner_contract_op','on',true);
  INSERT INTO public.partner_payment_contracts(company_id,settlement_id,participant_id,event_id,direction,beneficiary_supplier_id,
    gross,withholding_applies,withholding_rate,withholding_amount,withholding_due_date,due_date,advances_amount,label,idempotency_key,created_by)
  VALUES(p.company_id,p.settlement_id,p.id,p.event_id,'out',_beneficiary,_gross,_wh_applies,_wh_rate,wh,_wh_due,_due,adv,nullif(btrim(_label),''),_key,auth.uid()) RETURNING id INTO cid;
  -- Não gerar transação de saldo zero (padrão Cachê); nunca uma mãe/filha ou linha de BP.
  IF _gross-wh-adv>0 THEN
    INSERT INTO public.transactions(company_id,event_id,type,category_id,description,amount,iva_rate,date,due_date,status,
      supplier_id,account_id,paid_amount,partner_contract_id,partner_contract_role)
    VALUES(p.company_id,p.event_id,'expense',cat,'Distribuição de resultado — saldo',_gross-wh-adv,0,today,_due,'approved',_beneficiary,NULL,0,cid,'balance') RETURNING id INTO bid;
  END IF;
  IF _wh_applies AND wh>0 THEN
    INSERT INTO public.transactions(company_id,event_id,type,category_id,description,amount,iva_rate,date,due_date,status,
      supplier_id,account_id,paid_amount,partner_contract_id,partner_contract_role)
    VALUES(p.company_id,p.event_id,'expense',cat,'Distribuição de resultado — retenção IRS',wh,0,today,_wh_due,'approved',at_supplier,NULL,0,cid,'withholding') RETURNING id INTO wid;
  END IF;
  UPDATE public.partner_payment_contracts SET balance_tx_id=bid,withholding_tx_id=wid WHERE id=cid;
  UPDATE public.transactions SET partner_contract_id=cid,partner_contract_role='advance' WHERE id=ANY(ids);
  PERFORM set_config('app.partner_contract_op','off',true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,new_data,company_id)
    VALUES('partner_payment_contracts',cid::text,'partner_contract_created',auth.uid()::text,jsonb_build_object('gross',_gross,'advance_ids',ids),p.company_id);
  RETURN cid;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_partner_payment_contract(_contract_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.partner_payment_contracts; pid uuid; ids uuid[]; roots uuid[]; t public.transactions;
BEGIN
  SELECT participant_id INTO pid FROM public.partner_payment_contracts WHERE id=_contract_id AND company_id=public.current_company_id();
  PERFORM public._partner_contract_share(pid);
  SELECT * INTO c FROM public.partner_payment_contracts WHERE id=_contract_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'contrato_inexistente'; END IF;
  IF c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_ja_cancelado'; END IF;
  IF nullif(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
  ids:=ARRAY(SELECT id FROM public.transactions WHERE partner_contract_id=c.id OR id IN(c.balance_tx_id,c.withholding_tx_id) ORDER BY id);
  PERFORM public._partner_contract_assert_unpaid(ids);
  roots:=ARRAY(SELECT id FROM public.transactions WHERE id IN(c.balance_tx_id,c.withholding_tx_id) ORDER BY id);
  IF EXISTS(SELECT 1 FROM public.transactions WHERE id=ANY(ids) AND company_id IS DISTINCT FROM c.company_id)
    OR EXISTS(SELECT 1 FROM public.transactions WHERE parent_transaction_id=ANY(roots))
    OR EXISTS(SELECT 1 FROM public.transactions WHERE id=ANY(roots) AND (invoice_group_id IS NOT NULL OR cache_contract_id IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.transactions WHERE partner_contract_id=c.id AND partner_contract_role IS DISTINCT FROM 'advance' AND NOT(id=ANY(roots)))
    THEN RAISE EXCEPTION 'dependencia_inesperada'; END IF;
  -- Não limpar provas fiscais/BP/bilheteira de um contrato de capital: recusar associações inesperadas.
  IF EXISTS(SELECT 1 FROM public.event_forecasts WHERE transaction_id=ANY(roots))
    OR EXISTS(SELECT 1 FROM public.event_ticket_office_advances WHERE transaction_id=ANY(roots))
    OR EXISTS(SELECT 1 FROM public.ticket_office_statement_lines WHERE transaction_id=ANY(roots))
    THEN RAISE EXCEPTION 'dependencia_externa: remova pelo fluxo normal'; END IF;
  PERFORM set_config('app.partner_contract_op','on',true);
  FOR t IN SELECT * FROM public.transactions WHERE id=ANY(roots) LOOP
    INSERT INTO public.trash(entity_type,entity_id,entity_data,related_data,deleted_by,company_id,expires_at)
      VALUES('transaction',t.id,to_jsonb(t),'{}'::jsonb,auth.uid()::text,c.company_id,now()+interval '30 days');
    INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,metadata,company_id)
      VALUES('transaction',t.id::text,'delete',auth.uid()::text,to_jsonb(t),jsonb_build_object('rpc','cancel_partner_payment_contract','contract_id',c.id,'reason',_reason),c.company_id);
  END LOOP;
  -- FK NO ACTION nos dois sentidos: limpar ANTES do DELETE.
  UPDATE public.partner_payment_contracts SET balance_tx_id=NULL,withholding_tx_id=NULL,cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=_reason WHERE id=c.id;
  UPDATE public.transactions SET partner_contract_id=NULL,partner_contract_role=NULL WHERE partner_contract_id=c.id;
  UPDATE public.reimbursement_notes SET payment_transaction_id=NULL WHERE payment_transaction_id=ANY(roots);
  DELETE FROM public.payment_list_items WHERE transaction_id=ANY(roots);
  DELETE FROM public.reimbursement_note_items WHERE transaction_id=ANY(roots);
  DELETE FROM public.partner_paid_expenses WHERE transaction_id=ANY(roots);
  DELETE FROM public.partner_advance_expenses WHERE transaction_id=ANY(roots);
  DELETE FROM public.supplier_credit_usages WHERE transaction_id=ANY(roots);
  DELETE FROM public.transaction_documents WHERE transaction_id=ANY(roots);
  DELETE FROM public.transactions WHERE id=ANY(roots);
  PERFORM set_config('app.partner_contract_op','off',true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,company_id)
    VALUES('partner_payment_contracts',c.id::text,'partner_contract_cancelled',auth.uid()::text,to_jsonb(c),c.company_id);
  RETURN jsonb_build_object('ok',true,'contract_id',c.id);
END $function$;

CREATE OR REPLACE FUNCTION public.update_partner_payment_contract(
  _contract_id uuid, _beneficiary uuid, _gross numeric, _wh_applies boolean, _wh_rate numeric,
  _wh_due date, _due date, _advance_ids uuid[] DEFAULT '{}'::uuid[], _label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid uuid; cid uuid;
BEGIN
  SELECT participant_id INTO pid FROM public.partner_payment_contracts WHERE id=_contract_id AND company_id=public.current_company_id();
  PERFORM public._partner_contract_share(pid);
  PERFORM public.cancel_partner_payment_contract(_contract_id,'alterado');
  cid:=public.create_partner_payment_contract(pid,_beneficiary,_gross,_wh_applies,_wh_rate,_wh_due,_due,_advance_ids,_label,NULL);
  PERFORM set_config('app.partner_contract_op','on',true);
  UPDATE public.partner_payment_contracts SET replaced_by=cid WHERE id=_contract_id;
  PERFORM set_config('app.partner_contract_op','off',true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,new_data,company_id)
    VALUES('partner_payment_contracts',_contract_id::text,'partner_contract_updated',auth.uid()::text,jsonb_build_object('replaced_by',cid),public.current_company_id());
  RETURN cid;
END $function$;

CREATE OR REPLACE FUNCTION public.attach_partner_advance_to_contract(_contract_id uuid, _advance_tx_id uuid, _confirm_beneficiary boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.partner_payment_contracts; pid uuid; a numeric; b public.transactions; t public.transactions;
BEGIN
  SELECT participant_id INTO pid FROM public.partner_payment_contracts WHERE id=_contract_id AND company_id=public.current_company_id();
  PERFORM public._partner_contract_share(pid);
  SELECT * INTO c FROM public.partner_payment_contracts WHERE id=_contract_id FOR UPDATE;
  IF c.id IS NULL OR c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_inexistente_ou_cancelado'; END IF;
  SELECT * INTO t FROM public.transactions WHERE id=_advance_tx_id FOR UPDATE;
  IF t.partner_contract_id=c.id AND t.partner_contract_role='advance' THEN
    RETURN jsonb_build_object('already_attached',true,'contract_id',c.id,'advance_id',t.id); END IF;
  a:=public._partner_contract_advance(pid,_advance_tx_id,c.beneficiary_supplier_id,_confirm_beneficiary);
  SELECT * INTO b FROM public.transactions WHERE id=c.balance_tx_id FOR UPDATE;
  IF b.id IS NULL OR a>b.amount THEN RAISE EXCEPTION 'saldo_negativo'; END IF;
  PERFORM public._partner_contract_assert_unpaid(ARRAY[b.id]);
  IF EXISTS(SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id=li.payment_list_id
    WHERE li.transaction_id=b.id AND li.removed_at IS NULL AND pl.status<>'rejected') THEN RAISE EXCEPTION 'saldo_em_lista'; END IF;
  PERFORM set_config('app.partner_contract_op','on',true);
  UPDATE public.transactions SET partner_contract_id=c.id,partner_contract_role='advance' WHERE id=t.id;
  UPDATE public.transactions SET amount=amount-a WHERE id=b.id;
  UPDATE public.partner_payment_contracts SET advances_amount=advances_amount+a WHERE id=c.id;
  PERFORM set_config('app.partner_contract_op','off',true);
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,new_data,company_id)
    VALUES('partner_payment_contracts',c.id::text,'partner_contract_advance_attached',auth.uid()::text,jsonb_build_object('advance_id',t.id,'amount',a),c.company_id);
  RETURN jsonb_build_object('already_attached',false,'contract_id',c.id,'advance_id',t.id,'amount',a);
END $function$;

CREATE OR REPLACE FUNCTION public.partner_contract_status(_participant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.event_settlement_participants; share numeric; contracted numeric; paid numeric; contracts jsonb; free jsonb;
BEGIN
  -- Leitura autorizada também após selo; não usar helper de escrita nem FOR UPDATE.
  IF auth.uid() IS NULL OR public.current_company_id() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_permission(auth.uid(),'manage_bp'),false) THEN
    RAISE EXCEPTION 'Sem permissão para contratos de sócios' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.event_settlement_participants WHERE id=_participant_id AND company_id=public.current_company_id();
  IF p.id IS NULL THEN RAISE EXCEPTION 'participante_invalido'; END IF;
  IF p.frozen_values->>'share_amount' IS NULL THEN RAISE EXCEPTION 'parte_congelada_em_falta'; END IF;
  share:=(p.frozen_values->>'share_amount')::numeric;
  SELECT coalesce(sum(gross),0),coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id),'[]'::jsonb)
    INTO contracted,contracts FROM public.partner_payment_contracts c WHERE participant_id=p.id AND cancelled_at IS NULL;
  SELECT coalesce(sum(least(t.amount,greatest(coalesce(t.paid_amount,0),0))),0) INTO paid
    FROM public.transactions t JOIN public.partner_payment_contracts c ON c.id=t.partner_contract_id
    WHERE c.participant_id=p.id AND c.cancelled_at IS NULL;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.date,t.id),'[]'::jsonb) INTO free FROM public.transactions t
    JOIN public.account_categories ac ON ac.id=t.category_id
    WHERE t.company_id=p.company_id AND t.event_id=p.event_id AND t.supplier_id=p.supplier_id
      AND ac.code='10.1.03' AND t.type='expense' AND t.partner_contract_id IS NULL AND t.partner_contract_role IS NULL
      AND t.parent_transaction_id IS NULL AND t.cache_contract_id IS NULL AND t.invoice_group_id IS NULL
      AND t.reversed_at IS NULL AND t.amount>0 AND coalesce(t.iva_rate,0)=0 AND coalesce(t.currency,'EUR')='EUR'
      AND NOT EXISTS(SELECT 1 FROM public.transactions child WHERE child.parent_transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.transaction_offsets o WHERE t.id IN(o.receivable_transaction_id,o.payable_transaction_id))
      AND NOT EXISTS(SELECT 1 FROM public.transaction_offset_items oi WHERE oi.transaction_id=t.id);
  RETURN jsonb_build_object('participant_id',p.id,'share_amount',share,'contracted',contracted,'paid',paid,
    'missing',greatest(contracted-paid,0),'remaining',share-contracted,'contracts',contracts,'free_advances',free);
END $function$;

REVOKE ALL ON FUNCTION public._partner_contract_share(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._partner_contract_assert_unpaid(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._partner_contract_advance(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_partner_payment_contract(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_partner_advance_to_contract(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_contract_status(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_partner_payment_contract(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_partner_payment_contract(uuid,uuid,numeric,boolean,numeric,date,date,uuid[],text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_partner_advance_to_contract(uuid,uuid,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_contract_status(uuid) TO authenticated, service_role;

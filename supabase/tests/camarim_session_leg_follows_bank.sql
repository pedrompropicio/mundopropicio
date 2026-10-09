-- #287 / D-ERP200 — corre e reverte (RAISE no fim). Esperado:
-- RESULTADO pago=paid/123.45/1 | repetido=paid/123.45/1 | estornado=approved/0/0 | invariante=0
-- Devolução: RESULTADO devolucao sessao=paid/50
DO $$
DECLARE s record; cat uuid; b uuid; st uuid; bp uuid; r1 text; r2 text; r3 text; r4 text; bank uuid;
BEGIN
  SELECT * INTO s FROM camarim_sessions WHERE status <> 'integrated' AND advance_account_id IS NOT NULL LIMIT 1;
  SELECT id INTO cat FROM account_categories WHERE code='10.3' AND company_id=s.company_id LIMIT 1;
  SELECT id INTO bank FROM financial_accounts WHERE type='bank' AND company_id=s.company_id AND is_active LIMIT 1;
  INSERT INTO transactions(type,description,amount,iva_rate,category_id,account_id,date,status,payment_method,company_id)
   VALUES('expense','TESTE #287',123.45,0,cat,bank,current_date,'pending','transfer',s.company_id) RETURNING id INTO b;
  INSERT INTO transactions(type,description,amount,iva_rate,category_id,account_id,date,status,payment_method,company_id)
   VALUES('income','TESTE #287',123.45,0,cat,s.advance_account_id,current_date,'pending','transfer',s.company_id) RETURNING id INTO st;
  INSERT INTO camarim_fund_moves(session_id,move_type,amount,move_date,financial_account_id,transaction_id,company_id)
   VALUES(s.id,'advance',123.45,current_date,bank,b,s.company_id);
  INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id,status,created_by,company_id)
   VALUES(b,123.45,current_date,bank,'paid','teste',s.company_id) RETURNING id INTO bp;
  SELECT status||'/'||paid_amount||'/'||(SELECT count(*) FROM transaction_payments WHERE transaction_id=st) INTO r1 FROM transactions WHERE id=st;
  UPDATE transaction_payments SET notes='x' WHERE id=bp;
  SELECT status||'/'||paid_amount||'/'||(SELECT count(*) FROM transaction_payments WHERE transaction_id=st) INTO r2 FROM transactions WHERE id=st;
  SELECT current_count::text INTO r4 FROM _run_invariant_checks_camarim();
  UPDATE transaction_payments SET status='reversed', reversed_at=now() WHERE id=bp;
  SELECT status||'/'||paid_amount||'/'||(SELECT count(*) FROM transaction_payments WHERE transaction_id=st) INTO r3 FROM transactions WHERE id=st;
  RAISE EXCEPTION 'RESULTADO pago=% | repetido=% | estornado=% | invariante=%', r1, r2, r3, r4;
END $$;

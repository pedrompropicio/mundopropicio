-- 0309 — Issue #341 E2b: histórico pago declarativo.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Pedro, comentário 6612516798, 03/11/2026; autorização válida até 14/11/2026.
-- Aplicação exclusiva do 0, em janela própria; sem reconstrução de pagamentos.
-- Só historical_at do próprio evento; não herda o carimbo do master.
-- Nenhum DML financeiro: preserva os valores importados enquanto não houver linhas.
-- Com qualquer linha (incluindo reversed/planned), a derivação normal mantém-se.
-- ACL de _derive_paid_amount preservada por CREATE OR REPLACE.
-- Rollback comentado: supabase/manual/rollback_0309_issue341_historico_pago_declarativo_comentado.sql

BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public._derive_paid_amount(uuid)') IS NULL THEN
  RAISE EXCEPTION 'issue341: derive_required';
 END IF;
 IF position('issue335-status-v2l' in pg_get_functiondef('public._derive_paid_amount(uuid)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'issue341: issue335_status_v2l_required';
 END IF;
 IF to_regprocedure('public._run_invariant_checks_paid()') IS NULL THEN
  RAISE EXCEPTION 'issue341: invariant_paid_required';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric; v_iva_rate numeric; v_status text; v_currency text;
  v_parent uuid; v_split numeric; v_reimb boolean;
  v_gross numeric; v_paid_sum numeric; v_max_paid_date date; v_closes boolean;
  prior record;
BEGIN
  -- issue335-status-v2l: exact earlier state only inside proven reversal; all other paths unchanged.
  SELECT t.amount, COALESCE(t.iva_rate, 0), t.status, COALESCE(t.currency, 'EUR'),
         t.parent_transaction_id, t.split_percentage, COALESCE(t.is_reimbursement, false)
    INTO v_amount, v_iva_rate, v_status, v_currency, v_parent, v_split, v_reimb
    FROM public.transactions t WHERE t.id = p_tx_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  IF (v_parent IS NOT NULL AND v_split IS NOT NULL) OR v_reimb
     OR EXISTS (SELECT 1 FROM public.partner_paid_expenses p WHERE p.transaction_id = p_tx_id)
  THEN RETURN; END IF;
  -- issue341-historico-v1: evento histórico sem nenhuma linha em transaction_payments ⇒ estado/paid_amount importados são declarativos (Pedro, 03/11/2026).
  IF EXISTS (SELECT 1 FROM public.transactions t JOIN public.events e ON e.id = t.event_id
              WHERE t.id = p_tx_id AND e.historical_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = p_tx_id)
  THEN RETURN; END IF;
  v_gross := v_amount * (1 + v_iva_rate / 100.0);
  SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date),
         COALESCE(bool_or(COALESCE(p.closes_transaction, false)), false)
    INTO v_paid_sum, v_max_paid_date, v_closes FROM public.transaction_payments p
   WHERE p.transaction_id = p_tx_id AND p.status = 'paid';
  IF public.issue335_context_valid('reverse') THEN
   SELECT i.* INTO prior FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id
   WHERE i.transaction_id=p_tx_id AND g.status='reversing' AND i.prior_paid_amount=v_paid_sum
    AND NOT EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND p.transaction_id=p_tx_id
       AND (p.status<>'reversed' OR p.reversed_at IS NULL));
   IF FOUND THEN
    UPDATE public.transactions SET paid_amount=v_paid_sum,status=prior.prior_status,
      payment_date=prior.prior_payment_date,updated_at=now() WHERE id=p_tx_id;
    RETURN;
   END IF;
  END IF;
  IF v_paid_sum <= 0.01 THEN
    UPDATE public.transactions SET paid_amount=0,
      status=CASE WHEN v_status IN('paid','partially_paid') THEN 'approved' ELSE v_status END,
      payment_date=NULL,updated_at=now() WHERE id=p_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.05 OR (v_currency <> 'EUR' AND v_closes) THEN
    UPDATE public.transactions SET paid_amount=v_paid_sum,status='paid',
      payment_date=COALESCE(v_max_paid_date,CURRENT_DATE),updated_at=now() WHERE id=p_tx_id;
  ELSE
    UPDATE public.transactions SET paid_amount=v_paid_sum,status='approved',payment_date=NULL,updated_at=now() WHERE id=p_tx_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount, t.account_id
      FROM public.transactions t
     WHERE COALESCE(t.paid_amount, 0) > 0.01
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p
                        WHERE p.transaction_id = t.id AND p.status = 'paid')
       AND NOT (EXISTS (SELECT 1 FROM public.events e WHERE e.id = t.event_id AND e.historical_at IS NOT NULL)
                AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p2 WHERE p2.transaction_id = t.id))
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY paid_amount DESC LIMIT 6) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, i.reference_count, (cZ = i.reference_count) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'paid_sem_pagamento';
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_paid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO service_role;

UPDATE public.system_invariants
   SET reference_count = 0,
       notes = '#341 — Pedro, 03/11/2026, comentário 6612516798: estado pago e paid_amount importados são declarativos nos eventos com historical_at próprio e sem nenhuma linha em transaction_payments; excluídos desta vigia. Com qualquer linha, incluindo estornada ou planeada, aplica-se a regra normal. Sem backfill nem alteração de valores.',
       reference_updated_at = now()
 WHERE name = 'paid_sem_pagamento';
COMMIT;

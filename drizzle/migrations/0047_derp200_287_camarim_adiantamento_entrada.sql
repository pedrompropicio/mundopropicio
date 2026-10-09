-- D-ERP200 / #287: a perna da conta-corrente da sessão (camarim_session) de um movimento
-- de caixa do camarim acompanha o pagamento da perna do banco.
-- Elo: camarim_fund_moves.transaction_id (perna do banco em advance/reinforcement;
-- perna da sessão em refund) + gémea 10.3 com a mesma descrição, data, valor, empresa,
-- tipo oposto, na conta camarim_sessions.advance_account_id.

CREATE OR REPLACE FUNCTION public._camarim_fund_move_legs(p_move_id uuid)
RETURNS TABLE(bank_tx uuid, session_tx uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH fm AS (
    SELECT m.move_type, m.transaction_id, s.advance_account_id AS sess_acc
      FROM public.camarim_fund_moves m
      JOIN public.camarim_sessions s ON s.id = m.session_id
     WHERE m.id = p_move_id AND m.transaction_id IS NOT NULL
       AND m.move_type IN ('advance','reinforcement','refund')
  ), linked AS (
    SELECT fm.*, t.* FROM fm JOIN public.transactions t ON t.id = fm.transaction_id
  ), twin AS (
    SELECT l.move_type, l.transaction_id, l.sess_acc,
           (SELECT t2.id FROM public.transactions t2
             WHERE t2.id <> l.id AND t2.company_id = l.company_id
               AND t2.description = l.description AND t2.date = l.date
               AND t2.amount = l.amount AND t2.category_id IS NOT DISTINCT FROM l.category_id
               AND t2.type <> l.type
               AND CASE WHEN l.move_type = 'refund'
                        THEN t2.account_id IS DISTINCT FROM l.sess_acc
                        ELSE t2.account_id = l.sess_acc END
             ORDER BY abs(extract(epoch FROM t2.created_at - l.created_at)) LIMIT 1) AS other
      FROM linked l
     WHERE CASE WHEN l.move_type = 'refund' THEN l.account_id = l.sess_acc
                ELSE l.account_id IS DISTINCT FROM l.sess_acc END
  )
  SELECT CASE WHEN move_type = 'refund' THEN other ELSE transaction_id END,
         CASE WHEN move_type = 'refund' THEN transaction_id ELSE other END
    FROM twin WHERE other IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.camarim_sync_session_leg_payment(p_tx uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r record; v_sum numeric; v_date date; v_gross numeric; v_acc uuid; v_company uuid; v_cur text;
BEGIN
  FOR r IN
    SELECT l.bank_tx, l.session_tx
      FROM public.camarim_fund_moves m
      CROSS JOIN LATERAL public._camarim_fund_move_legs(m.id) l
     WHERE m.transaction_id = p_tx
        OR (m.move_type = 'refund' AND EXISTS (
              SELECT 1 FROM public.transactions a, public.transactions b
               WHERE a.id = m.transaction_id AND b.id = p_tx AND b.id <> a.id
                 AND b.description = a.description AND b.date = a.date AND b.amount = a.amount))
  LOOP
    CONTINUE WHEN r.bank_tx IS DISTINCT FROM p_tx;
    -- Pagamentos manuais na perna da sessão (ex.: correções de 09/10) mandam: não tocar.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.transaction_payments p
                           WHERE p.transaction_id = r.session_tx AND p.status = 'paid'
                             AND p.created_by <> 'base #287');

    SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date)
      INTO v_sum, v_date
      FROM public.transaction_payments p
     WHERE p.transaction_id = r.bank_tx AND p.status = 'paid';

    SELECT t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0), t.account_id, t.company_id, COALESCE(t.currency,'EUR')
      INTO v_gross, v_acc, v_company, v_cur
      FROM public.transactions t WHERE t.id = r.session_tx;

    -- Idempotente: a linha da base é recalculada a partir da perna do banco.
    IF EXISTS (SELECT 1 FROM public.transaction_payments p
                WHERE p.transaction_id = r.session_tx AND p.created_by = 'base #287'
                  AND p.status = 'paid' AND p.amount = LEAST(v_sum, v_gross)
                  AND p.payment_date = v_date)
       AND (SELECT count(*) FROM public.transaction_payments p
             WHERE p.transaction_id = r.session_tx AND p.created_by = 'base #287') = 1 THEN
      CONTINUE;
    END IF;

    DELETE FROM public.transaction_payments
     WHERE transaction_id = r.session_tx AND created_by = 'base #287';

    IF v_sum > 0.01 THEN
      INSERT INTO public.transaction_payments
        (transaction_id, amount, payment_date, account_id, payment_method, status,
         created_by, company_id, currency, notes)
      VALUES (r.session_tx, LEAST(v_sum, v_gross), v_date, v_acc, 'transfer', 'paid',
              'base #287', v_company, v_cur, 'Entrada na conta da sessão (espelho da perna do banco)');
    END IF;

    PERFORM public._derive_paid_amount(r.session_tx);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_camarim_session_leg_follows_bank()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.camarim_sync_session_leg_payment(OLD.transaction_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.transaction_id <> OLD.transaction_id) THEN
    PERFORM public.camarim_sync_session_leg_payment(NEW.transaction_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_camarim_session_leg_follows_bank ON public.transaction_payments;
CREATE TRIGGER zz_camarim_session_leg_follows_bank
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_camarim_session_leg_follows_bank();

REVOKE ALL ON FUNCTION public._camarim_fund_move_legs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.camarim_sync_session_leg_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._camarim_fund_move_legs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.camarim_sync_session_leg_payment(uuid) TO service_role;

-- Invariante
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('camarim_adiantamento_sem_entrada',
 'Perna de receita na conta camarim_session de um adiantamento/reforço com valor pago abaixo do bruto quando a perna do banco está paga',
 'error', 'empresa', 0,
 '#287 (09/10/2026, D-ERP200). Trigger zz_camarim_session_leg_follows_bank espelha o pagamento da perna do banco.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_camarim()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH bad AS (
    SELECT m.id AS move_id, m.session_id, l.session_tx, l.bank_tx, st.paid_amount, st.amount
      FROM public.camarim_fund_moves m
      CROSS JOIN LATERAL public._camarim_fund_move_legs(m.id) l
      JOIN public.transactions bt ON bt.id = l.bank_tx
      JOIN public.transactions st ON st.id = l.session_tx
     WHERE m.move_type IN ('advance','reinforcement')
       AND bt.status = 'paid'
       AND COALESCE(st.paid_amount, 0) < st.amount * (1 + COALESCE(st.iva_rate,0) / 100.0) - 0.01
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, (c = i.reference_count), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'camarim_adiantamento_sem_entrada';
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_camarim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_camarim() TO service_role;

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
$function$;
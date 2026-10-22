-- LOCAL/INERTE 2n-Bloco5 (M6). Separate Pedro Sim required; never installed in Live.
-- Independent watch: compares encounter legs against the bank statement and against the encounter's
-- own amounts. It never reads transactions.paid_amount, financial_accounts.initial_balance(_date),
-- the "managed" set nor _account_true_balance*; so it cannot share a defect with the balance formula.
-- Requires offset_balance (replaces the body of issue335_balance_invariant_count, same name/ACL).
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public.issue335_balance_invariant_count()') IS NULL THEN RAISE EXCEPTION 'installation_order: offset_balance_required'; END IF;
 IF to_regprocedure('public.issue335_cash_watch()') IS NOT NULL THEN RAISE EXCEPTION 'cash_watch_exists_requires_review'; END IF;
END $$;
CREATE FUNCTION public.issue335_cash_watch() RETURNS TABLE(name text,current_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 WITH g AS (SELECT id,account_id,movement_amount,operation_date,status FROM public.transaction_offset_groups),
 legs AS (
  SELECT p.id,p.offset_group_id gid,p.offset_item_id iid,p.transaction_id,p.payment_method m,p.amount,p.account_id,p.payment_date,
         CASE t.type WHEN 'income' THEN 1 WHEN 'expense' THEN -1 END sgn
    FROM public.transaction_payments p JOIN public.transactions t ON t.id=p.transaction_id
   WHERE p.offset_group_id IS NOT NULL AND p.status='paid' AND p.reversed_at IS NULL),
 -- (i) cash per account and day against the statement (header only when the movement has no bank line)
 cash_day AS (SELECT l.account_id acc,l.payment_date d,sum(l.sgn*l.amount) v FROM legs l JOIN g ON g.id=l.gid AND g.status='applied'
               WHERE l.m IS DISTINCT FROM 'compensation' GROUP BY 1,2),
 stmt_src AS (
  SELECT b.financial_account_id acc,coalesce(b.value_date,b.booking_date) d,b.amount v
    FROM public.bank_statement_lines b JOIN g ON g.id=b.offset_group_id AND g.status='applied'
  UNION ALL
  SELECT g.account_id,g.operation_date,g.movement_amount FROM g
   WHERE g.status='applied' AND g.movement_amount<>0 AND NOT EXISTS(SELECT 1 FROM public.bank_statement_lines b WHERE b.offset_group_id=g.id)),
 stmt_day AS (SELECT acc,d,sum(v) v FROM stmt_src GROUP BY 1,2),
 w_extracto AS (SELECT count(*) n FROM cash_day c FULL JOIN stmt_day s ON coalesce(s.acc,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(c.acc,'00000000-0000-0000-0000-000000000000'::uuid) AND coalesce(s.d,'-infinity'::date)=coalesce(c.d,'-infinity'::date)
                 WHERE c.acc IS NULL OR s.acc IS NULL OR coalesce(c.v,0)<>coalesce(s.v,0)),
 -- statement links = documents that actually received cash legs in the group
 w_ligacoes AS (SELECT count(*) n FROM public.bank_statement_lines b JOIN g ON g.id=b.offset_group_id AND g.status='applied'
   WHERE EXISTS(SELECT transaction_id FROM public.bank_line_transactions WHERE line_id=b.id
                EXCEPT SELECT transaction_id FROM legs WHERE gid=g.id AND m IS DISTINCT FROM 'compensation')
      OR EXISTS(SELECT transaction_id FROM legs WHERE gid=g.id AND m IS DISTINCT FROM 'compensation'
                EXCEPT SELECT transaction_id FROM public.bank_line_transactions WHERE line_id=b.id)),
 -- (ii) legs per document against the encounter amounts; full ledger of the document closes exactly
 w_documento AS (SELECT count(*) n FROM public.transaction_offset_items i JOIN g ON g.id=i.group_id AND g.status='applied'
   WHERE i.cash_amount IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM legs WHERE iid=i.id AND m IS DISTINCT FROM 'compensation')
      OR i.compensation_amount IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM legs WHERE iid=i.id AND m='compensation')
      OR (SELECT count(*) FROM legs WHERE iid=i.id)<>(i.cash_amount>0)::int+(i.compensation_amount>0)::int
      OR i.prior_paid_amount+i.open_amount IS DISTINCT FROM (SELECT coalesce(sum(p.amount),0) FROM public.transaction_payments p
            WHERE p.transaction_id=i.transaction_id AND p.status='paid' AND p.reversed_at IS NULL)),
 -- (ii) legs per group against the encounter value
 w_grupo AS (SELECT count(*) n FROM g WHERE g.status='applied' AND (
         g.movement_amount IS DISTINCT FROM (SELECT coalesce(sum(sgn*amount),0) FROM legs WHERE gid=g.id AND m IS DISTINCT FROM 'compensation')
      OR 0 IS DISTINCT FROM (SELECT coalesce(sum(sgn*amount),0) FROM legs WHERE gid=g.id AND m='compensation')
      OR EXISTS(SELECT 1 FROM legs WHERE gid=g.id AND (payment_date IS DISTINCT FROM g.operation_date OR sgn IS NULL
           OR (m IS DISTINCT FROM 'compensation' AND account_id IS DISTINCT FROM g.account_id) OR (m='compensation' AND account_id IS NOT NULL)))
      OR EXISTS(SELECT 1 FROM legs l WHERE l.gid=g.id AND NOT EXISTS(SELECT 1 FROM public.transaction_offset_items i WHERE i.id=l.iid AND i.group_id=g.id AND i.transaction_id=l.transaction_id)))),
 -- reversed / in-flight groups keep no live leg; applied groups keep no dead leg
 w_estado AS (SELECT count(*) n FROM g WHERE (g.status<>'applied' AND EXISTS(SELECT 1 FROM legs WHERE gid=g.id))
      OR (g.status='applied' AND EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND (p.status<>'paid' OR p.reversed_at IS NOT NULL)))),
 -- adopted legacy pairs: both sides are items of the group and carry a live leg in it
 w_offsets AS (SELECT count(*) n FROM public.transaction_offsets o JOIN g ON g.id=o.offset_group_id AND g.status='applied'
   WHERE NOT EXISTS(SELECT 1 FROM legs WHERE gid=g.id AND transaction_id=o.receivable_transaction_id)
      OR NOT EXISTS(SELECT 1 FROM legs WHERE gid=g.id AND transaction_id=o.payable_transaction_id)),
 -- (b) union of accounts: legacy legs on the document account (same rule as core cash_account_inconsistent);
 -- group account = account of every cash leg (w_grupo) = statement account (w_extracto)
 w_contas AS (SELECT count(*) n FROM public.transaction_offset_items i JOIN g ON g.id=i.group_id AND g.status='applied' JOIN public.transactions t ON t.id=i.transaction_id
   WHERE EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id=t.id AND p.offset_group_id IS NULL AND p.status='paid' AND p.reversed_at IS NULL
           AND ((p.payment_method IS DISTINCT FROM 'compensation' AND (p.account_id IS NULL OR p.account_id IS DISTINCT FROM t.account_id))
             OR (p.payment_method='compensation' AND (t.account_id IS NOT NULL OR p.account_id IS NOT NULL)))))
 SELECT 'vigia_extracto_conta_data',n FROM w_extracto UNION ALL SELECT 'vigia_extracto_ligacoes',n FROM w_ligacoes
 UNION ALL SELECT 'vigia_perna_documento',n FROM w_documento UNION ALL SELECT 'vigia_perna_grupo',n FROM w_grupo
 UNION ALL SELECT 'vigia_estado_grupo',n FROM w_estado UNION ALL SELECT 'vigia_offset_adoptado',n FROM w_offsets
 UNION ALL SELECT 'vigia_contas_uniao',n FROM w_contas
$$;
REVOKE ALL ON FUNCTION public.issue335_cash_watch() FROM PUBLIC,anon,authenticated,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_cash_watch() TO service_role;
CREATE OR REPLACE FUNCTION public.issue335_balance_invariant_count() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT coalesce(sum(current_count),0)::bigint FROM public.issue335_cash_watch()
$$;
UPDATE public.system_invariants SET description='Pernas do encontro versus extracto e valores do encontro (vigia independente da fórmula de saldo)'
 WHERE name='encontro_saldo_dinheiro_divergente';
COMMIT;

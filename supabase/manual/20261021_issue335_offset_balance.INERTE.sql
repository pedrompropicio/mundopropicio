-- LOCAL/INERTE ONLY. Separate Pedro approval required for installed balance changes.
-- Ordem de instalação única (correcção D, docs/testes/issue335-quadro-final.md): storage → core → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch/emergency/reactivation → trigger_watch/cash_watch; ROLLBACK na ordem inversa.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- issue335-balance-v2l
  WITH acc AS (
    SELECT id, COALESCE(initial_balance, 0) AS initial_balance, initial_balance_date
    FROM public.financial_accounts
    WHERE id = _account_id
  ),
  managed AS (
    SELECT DISTINCT i.transaction_id
    FROM public.transaction_offset_items i
    JOIN public.transaction_offset_groups g ON g.id=i.group_id AND g.company_id=i.company_id
    WHERE g.status IN ('preparing','applied','reversing')
      AND EXISTS (SELECT 1 FROM public.transaction_payments p
                  WHERE p.offset_group_id=g.id AND p.offset_item_id=i.id
                    AND p.transaction_id=i.transaction_id AND p.status='paid' AND p.reversed_at IS NULL)
  ),
  mov AS (
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0)
           ELSE -COALESCE(t.paid_amount, 0) END
    ), 0) AS total
    FROM public.transactions t, acc
    WHERE t.account_id = acc.id
      AND NOT EXISTS (SELECT 1 FROM managed m WHERE m.transaction_id=t.id)
      AND (
        acc.initial_balance_date IS NULL
        OR COALESCE(t.payment_date, t.date) IS NULL
        OR COALESCE(t.payment_date, t.date) > acc.initial_balance_date
      )
  ),
  cash AS (
    SELECT COALESCE(SUM(CASE WHEN t.type='income' THEN p.amount ELSE -p.amount END),0) AS total
    FROM public.transaction_payments p
    JOIN public.transactions t ON t.id=p.transaction_id
    JOIN managed m ON m.transaction_id=t.id, acc
    WHERE p.account_id=acc.id AND p.payment_method<>'compensation'
      AND p.status='paid' AND p.reversed_at IS NULL
      AND (acc.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>acc.initial_balance_date)
  ),
  adj AS (
    SELECT COALESCE(SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0)), 0) AS total
    FROM public.transaction_payments p, acc
    WHERE p.account_id = acc.id AND p.status = 'paid' AND p.reversed_at IS NULL
      AND (
        acc.initial_balance_date IS NULL
        OR p.payment_date IS NULL
        OR p.payment_date > acc.initial_balance_date
      )
  )
  SELECT acc.initial_balance + mov.total + cash.total + adj.total
  FROM acc, mov, cash, adj;
$function$;
CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL::date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH acc AS (
    SELECT id, COALESCE(initial_balance, 0) AS initial_balance, initial_balance_date
    FROM public.financial_accounts WHERE id = _account_id
  ),
  managed AS (
    SELECT DISTINCT i.transaction_id
    FROM public.transaction_offset_items i
    JOIN public.transaction_offset_groups g ON g.id=i.group_id AND g.company_id=i.company_id
    WHERE g.status IN ('preparing','applied','reversing')
      AND EXISTS (SELECT 1 FROM public.transaction_payments p
                  WHERE p.offset_group_id=g.id AND p.offset_item_id=i.id
                    AND p.transaction_id=i.transaction_id AND p.status='paid' AND p.reversed_at IS NULL)
  ),
  mov AS (
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0)
           ELSE -COALESCE(t.paid_amount, 0) END
    ), 0) AS total
    FROM public.transactions t, acc
    WHERE t.account_id = acc.id
      AND NOT EXISTS (SELECT 1 FROM managed m WHERE m.transaction_id=t.id)
      AND (acc.initial_balance_date IS NULL
           OR COALESCE(t.payment_date, t.date) IS NULL
           OR COALESCE(t.payment_date, t.date) > acc.initial_balance_date)
      AND (_as_of IS NULL
           OR COALESCE(t.payment_date, t.date) IS NULL
           OR COALESCE(t.payment_date, t.date) <= _as_of)
  ),
  cash AS (
    SELECT COALESCE(SUM(CASE WHEN t.type='income' THEN p.amount ELSE -p.amount END),0) AS total
    FROM public.transaction_payments p
    JOIN public.transactions t ON t.id=p.transaction_id
    JOIN managed m ON m.transaction_id=t.id, acc
    WHERE p.account_id=acc.id AND p.payment_method<>'compensation'
      AND p.status='paid' AND p.reversed_at IS NULL
      AND (acc.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>acc.initial_balance_date)
      AND (_as_of IS NULL OR p.payment_date IS NULL OR p.payment_date<=_as_of)
  ),
  adj AS (
    SELECT COALESCE(SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0)), 0) AS total
    FROM public.transaction_payments p, acc
    WHERE p.account_id = acc.id AND p.status = 'paid' AND p.reversed_at IS NULL
      AND (acc.initial_balance_date IS NULL
           OR p.payment_date IS NULL
           OR p.payment_date > acc.initial_balance_date)
      AND (_as_of IS NULL OR p.payment_date IS NULL OR p.payment_date <= _as_of)
  )
  SELECT acc.initial_balance + mov.total + cash.total + adj.total FROM acc, mov, cash, adj;
$function$;

CREATE FUNCTION public.issue335_balance_invariant_count() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 WITH managed AS(SELECT DISTINCT i.transaction_id FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE g.status IN('preparing','applied','reversing') AND EXISTS(SELECT 1 FROM transaction_payments p WHERE p.offset_item_id=i.id AND p.status='paid' AND p.reversed_at IS NULL)),
 accounts AS(SELECT DISTINCT p.account_id FROM transaction_payments p JOIN managed m ON m.transaction_id=p.transaction_id WHERE p.account_id IS NOT NULL),
 expected AS(SELECT a.id,a.initial_balance+coalesce((SELECT sum(CASE WHEN t.type='income' THEN t.paid_amount ELSE -t.paid_amount END) FROM transactions t WHERE t.account_id=a.id AND NOT EXISTS(SELECT 1 FROM managed m WHERE m.transaction_id=t.id) AND (a.initial_balance_date IS NULL OR coalesce(t.payment_date,t.date) IS NULL OR coalesce(t.payment_date,t.date)>a.initial_balance_date)),0)+coalesce((SELECT sum(CASE WHEN t.type='income' THEN p.amount ELSE -p.amount END) FROM transaction_payments p JOIN transactions t ON t.id=p.transaction_id JOIN managed m ON m.transaction_id=t.id WHERE p.account_id=a.id AND p.payment_method<>'compensation' AND p.status='paid' AND p.reversed_at IS NULL AND (a.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>a.initial_balance_date)),0)+coalesce((SELECT sum(p.withholding_amount+p.credit_amount) FROM transaction_payments p WHERE p.account_id=a.id AND p.status='paid' AND p.reversed_at IS NULL AND (a.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>a.initial_balance_date)),0) total FROM financial_accounts a JOIN accounts x ON x.account_id=a.id)
 SELECT count(*) FROM expected WHERE total IS DISTINCT FROM public._account_true_balance_raw(id)
$$;
REVOKE ALL ON FUNCTION public.issue335_balance_invariant_count() FROM PUBLIC,anon,authenticated,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_balance_invariant_count() TO service_role;
INSERT INTO public.system_invariants(name,description,severity,scope,reference_count,notes) VALUES('encontro_saldo_dinheiro_divergente','Saldo canónico versus dinheiro das pernas geridas','error','empresa',0,'#335 local/inert; vigia separada de saldo');
COMMIT;

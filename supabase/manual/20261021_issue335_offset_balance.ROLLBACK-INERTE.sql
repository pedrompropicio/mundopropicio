-- LOCAL/INERTE ONLY. Separate Pedro approval required for installed balance changes.
-- Ordem de instalação única (correcção D, docs/testes/issue335-quadro-final.md): storage → core → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch/emergency/reactivation → trigger_watch/cash_watch; ROLLBACK na ordem inversa.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.transaction_offset_groups) THEN RAISE EXCEPTION 'groups_exist_keep_guards'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.issue335_cash_watch()') IS NOT NULL THEN RAISE EXCEPTION 'rollback_order: cash_watch_first'; END IF; END $$;
CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH acc AS (
    SELECT id, COALESCE(initial_balance, 0) AS initial_balance, initial_balance_date
    FROM public.financial_accounts
    WHERE id = _account_id
  ),
  mov AS (
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0)
           ELSE -COALESCE(t.paid_amount, 0) END
    ), 0) AS total
    FROM public.transactions t, acc
    WHERE t.account_id = acc.id
      AND (
        acc.initial_balance_date IS NULL
        OR COALESCE(t.payment_date, t.date) IS NULL
        OR COALESCE(t.payment_date, t.date) > acc.initial_balance_date
      )
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
  SELECT acc.initial_balance + mov.total + adj.total
  FROM acc, mov, adj;
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
  mov AS (
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0)
           ELSE -COALESCE(t.paid_amount, 0) END
    ), 0) AS total
    FROM public.transactions t, acc
    WHERE t.account_id = acc.id
      AND (acc.initial_balance_date IS NULL
           OR COALESCE(t.payment_date, t.date) IS NULL
           OR COALESCE(t.payment_date, t.date) > acc.initial_balance_date)
      AND (_as_of IS NULL
           OR COALESCE(t.payment_date, t.date) IS NULL
           OR COALESCE(t.payment_date, t.date) <= _as_of)
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
  SELECT acc.initial_balance + mov.total + adj.total FROM acc, mov, adj;
$function$;
DROP FUNCTION public.issue335_balance_invariant_count();
DELETE FROM public.system_invariants WHERE name='encontro_saldo_dinheiro_divergente';
COMMIT;

CREATE SCHEMA IF NOT EXISTS issue335_test;
CREATE OR REPLACE FUNCTION issue335_test.legacy_account_true_balance_raw(_account_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
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
CREATE OR REPLACE FUNCTION issue335_test.legacy_account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL::date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
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

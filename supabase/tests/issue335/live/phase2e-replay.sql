-- LOCAL ONLY fresh catalogue dependencies
ALTER TABLE public.payment_list_items ADD COLUMN IF NOT EXISTS removed_at timestamptz;
CREATE TABLE IF NOT EXISTS public.payment_list_sepa_exports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_list_id uuid,company_id uuid,exported_by uuid,exported_at timestamptz,file_name text,msg_id text,total_amount numeric,n_transactions integer,transaction_ids uuid[]);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payment_list_sepa_exports TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL::date)
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
CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)
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

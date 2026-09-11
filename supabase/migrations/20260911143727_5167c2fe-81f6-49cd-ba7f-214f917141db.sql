CREATE OR REPLACE FUNCTION public._account_true_balance_asof_raw(
  _account_id uuid,
  _as_of date DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    WHERE p.account_id = acc.id
      AND (acc.initial_balance_date IS NULL
           OR p.payment_date IS NULL
           OR p.payment_date > acc.initial_balance_date)
      AND (_as_of IS NULL OR p.payment_date IS NULL OR p.payment_date <= _as_of)
  )
  SELECT acc.initial_balance + mov.total + adj.total FROM acc, mov, adj;
$$;

REVOKE ALL ON FUNCTION public._account_true_balance_asof_raw(uuid, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.account_true_balances_asof(
  _account_ids uuid[],
  _as_of date DEFAULT NULL
) RETURNS TABLE(account_id uuid, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id,
    CASE
      WHEN COALESCE(a.skip_balance_check, false) THEN NULL::numeric
      WHEN public.is_platform_admin(auth.uid())
           OR public.has_role(auth.uid(), 'admin'::app_role)
           OR (public.has_permission(auth.uid(), 'view_balances')
               AND COALESCE(a.balance_visible_to_all, false))
        THEN public._account_true_balance_asof_raw(a.id, _as_of)
      ELSE NULL::numeric
    END
  FROM public.financial_accounts a
  WHERE a.id = ANY(_account_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.account_true_balances_asof(uuid[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_true_balances_asof(uuid[], date) TO authenticated, service_role;
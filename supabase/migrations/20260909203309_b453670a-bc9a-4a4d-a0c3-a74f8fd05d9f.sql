CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant(p_company_id uuid)
 RETURNS TABLE(sum_realized numeric, sum_initial numeric, lhs numeric, rhs_computebalance numeric, diff numeric, is_balanced boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sum_realized numeric;
  v_sum_initial  numeric;
  v_rhs          numeric;
BEGIN
  IF p_company_id IS DISTINCT FROM public.current_company_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: company mismatch';
  END IF;

  SELECT COALESCE(SUM(realized), 0) INTO v_sum_realized
  FROM public.get_event_cash_position(p_company_id, NULL, NULL);

  -- Mesmo universo do lado esquerdo: skip_balance_check fora (issue #90) e
  -- data de corte do saldo inicial respeitada (D-ERP25).
  SELECT COALESCE(SUM(fa.initial_balance), 0) INTO v_sum_initial
  FROM financial_accounts fa
  WHERE fa.company_id = p_company_id
    AND fa.type IN ('bank', 'cash', 'prepaid_card')
    AND COALESCE(fa.skip_balance_check, false) = false;

  SELECT COALESCE(SUM(bal), 0) INTO v_rhs
  FROM (
    SELECT fa.initial_balance
         + COALESCE((
             SELECT SUM(CASE WHEN t.type = 'income' THEN t.paid_amount
                             ELSE -t.paid_amount END)
             FROM transactions t
             WHERE t.account_id = fa.id
               AND (fa.initial_balance_date IS NULL
                    OR COALESCE(t.payment_date, t.date) > fa.initial_balance_date)
           ), 0)
         + COALESCE((
             SELECT SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0))
             FROM transaction_payments p
             LEFT JOIN transactions t2 ON t2.id = p.transaction_id
             WHERE p.account_id = fa.id
               AND (fa.initial_balance_date IS NULL
                    OR COALESCE(p.payment_date, t2.payment_date, t2.date) > fa.initial_balance_date)
           ), 0) AS bal
    FROM financial_accounts fa
    WHERE fa.company_id = p_company_id
      AND fa.type IN ('bank', 'cash', 'prepaid_card')
      AND COALESCE(fa.skip_balance_check, false) = false
  ) s;

  RETURN QUERY
  SELECT ROUND(v_sum_realized, 2),
         ROUND(v_sum_initial, 2),
         ROUND(v_sum_realized + v_sum_initial, 2),
         ROUND(v_rhs, 2),
         ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2),
         (ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2) = 0);
END;
$function$;
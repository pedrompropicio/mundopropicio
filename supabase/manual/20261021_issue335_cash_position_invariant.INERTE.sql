-- LOCAL/INERTE 2k. Separate Sim required; never installed in Live.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant(p_company_id uuid)
 RETURNS TABLE(sum_realized numeric, sum_initial numeric, lhs numeric, rhs_computebalance numeric, diff numeric, is_balanced boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- issue335-cash-position-invariant-v2l
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

  -- #335 2k: compara com o saldo canónico, não repete a fórmula antiga dos dois lados.
  SELECT coalesce(sum(public._account_true_balance_raw(fa.id)),0) INTO v_rhs
  FROM public.financial_accounts fa
  WHERE fa.company_id=p_company_id AND fa.type IN ('bank','cash','prepaid_card')
    AND coalesce(fa.skip_balance_check,false)=false;

  RETURN QUERY
  SELECT ROUND(v_sum_realized, 2),
         ROUND(v_sum_initial, 2),
         ROUND(v_sum_realized + v_sum_initial, 2),
         ROUND(v_rhs, 2),
         ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2),
         (ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2) = 0);
END;
$function$
;
COMMIT;

-- Saldo verdadeiro de uma conta financeira, pela fórmula canónica do frontend
-- (src/lib/account-balance.ts :: computeAccountBalance):
--   initial_balance
--   + Σ paid_amount das transações da conta (income soma, restante subtrai)
--   + Σ (withholding_amount + credit_amount) de transaction_payments da conta
-- Corte: só entram movimentos com COALESCE(payment_date, date) > initial_balance_date.
-- Sem filtro de status / reversed_at / is_hidden — igual ao frontend.
CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE p.account_id = acc.id
      AND (
        acc.initial_balance_date IS NULL
        OR p.payment_date IS NULL
        OR p.payment_date > acc.initial_balance_date
      )
  )
  SELECT acc.initial_balance + mov.total + adj.total
  FROM acc, mov, adj;
$$;

REVOKE ALL ON FUNCTION public._account_true_balance_raw(uuid) FROM PUBLIC;

-- Trava de saldo: devolve APENAS boolean, nunca o valor.
CREATE OR REPLACE FUNCTION public.account_has_balance_for(_account_id uuid, _amount numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip boolean;
  v_balance numeric;
BEGIN
  SELECT skip_balance_check INTO v_skip
  FROM public.financial_accounts WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_skip, false) THEN
    RETURN true;
  END IF;

  v_balance := public._account_true_balance_raw(_account_id);
  RETURN COALESCE(_amount, 0) <= COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.account_has_balance_for(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_has_balance_for(uuid, numeric) TO authenticated, service_role;

-- Leitura do saldo, com permissão. NULL quando o caller não pode ver.
CREATE OR REPLACE FUNCTION public.account_true_balance(_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible boolean;
  v_skip boolean;
  v_allowed boolean;
BEGIN
  SELECT balance_visible_to_all, skip_balance_check
    INTO v_visible, v_skip
  FROM public.financial_accounts WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_allowed :=
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_permission(auth.uid(), 'view_balances') AND COALESCE(v_visible, false));

  IF NOT v_allowed THEN
    RETURN NULL;
  END IF;

  -- Conta sem controlo de saldo: não há saldo a mostrar.
  IF COALESCE(v_skip, false) THEN
    RETURN NULL;
  END IF;

  RETURN public._account_true_balance_raw(_account_id);
END;
$$;

REVOKE ALL ON FUNCTION public.account_true_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_true_balance(uuid) TO authenticated, service_role;
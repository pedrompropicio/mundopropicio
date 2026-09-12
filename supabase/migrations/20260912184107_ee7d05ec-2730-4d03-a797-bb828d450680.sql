-- Saldo retido em bilheteira, no servidor (Passo 3, fase 1).
-- Porta para SQL a fórmula única do cliente (src/lib/ticket-office-balance.ts,
-- computeTicketOfficeBalance) — total por conta. NÃO converge com
-- _account_true_balance_asof_raw: a fórmula da bilheteira é diferente por
-- desenho (D-ERP15).
CREATE OR REPLACE FUNCTION public._ticket_office_balance_raw(_account_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sales AS (
    -- Vendas: financial_account_id = conta (igualdade estrita). Valor por
    -- ticketSaleRevenue(): total_value quando existe, senão quantity*unit_price.
    SELECT COALESCE(SUM(COALESCE(s.total_value, s.quantity * s.unit_price)), 0)::numeric AS total
      FROM public.ticket_sales s
     WHERE s.financial_account_id = _account_id
  ),
  txns AS (
    -- status em (approved, paid), reversed_at IS NULL, is_hidden falso.
    -- SEMPRE paid_amount (nunca amount). income soma; expense/transfer subtraem.
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0)
           WHEN t.type IN ('expense', 'transfer') THEN -COALESCE(t.paid_amount, 0)
           ELSE 0 END
    ), 0)::numeric AS total
      FROM public.transactions t
     WHERE t.account_id = _account_id
       AND t.status IN ('approved', 'paid')
       AND t.reversed_at IS NULL
       AND COALESCE(t.is_hidden, false) = false
  ),
  advances AS (
    -- Só os adiantamentos ainda abertos (sem transação e sem fecho); os
    -- restantes já estão contados pela transação.
    SELECT COALESCE(SUM(COALESCE(a.amount, 0)), 0)::numeric AS total
      FROM public.event_ticket_office_advances a
     WHERE a.financial_account_id = _account_id
       AND a.transaction_id IS NULL
       AND a.settlement_id IS NULL
  )
  SELECT sales.total + txns.total - advances.total
    FROM sales, txns, advances;
$function$;

COMMENT ON FUNCTION public._ticket_office_balance_raw(uuid) IS
  'Interna. Espelho exacto de computeTicketOfficeBalance (total). Sem portão de permissão — chamar sempre via public.ticket_office_balances.';

CREATE OR REPLACE FUNCTION public.ticket_office_balances(_account_ids uuid[])
RETURNS TABLE(account_id uuid, balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT a.id,
    CASE
      WHEN COALESCE(a.skip_balance_check, false) THEN NULL::numeric
      -- Isenção para service_role / crons (sem sessão): devolve valor.
      WHEN auth.uid() IS NULL THEN public._ticket_office_balance_raw(a.id)
      WHEN public.is_platform_admin(auth.uid())
           OR public.has_role(auth.uid(), 'admin'::app_role)
           OR (public.has_permission(auth.uid(), 'view_balances')
               AND COALESCE(a.balance_visible_to_all, false))
        THEN public._ticket_office_balance_raw(a.id)
      ELSE NULL::numeric
    END
  FROM public.financial_accounts a
  WHERE a.id = ANY(_account_ids);
END;
$function$;

COMMENT ON FUNCTION public.ticket_office_balances(uuid[]) IS
  'Saldo retido por bilheteira, com o mesmo portão de permissão de account_true_balances_asof. NULL = sem permissão ou sem controlo de saldo.';

-- D-ERP37: fechado por omissão.
REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.ticket_office_balances(uuid[]) TO authenticated, service_role;
-- Arredondamento a 2 casas NO TOTAL (nunca por parcela).
-- computeTicketOfficeBalance (src/lib/ticket-office-balance.ts) não arredonda
-- nenhuma parcela: soma vendas, transações e adiantamentos em bruto e só o
-- valor final é formatado. Arredondar por parcela divergiria do cliente.
CREATE OR REPLACE FUNCTION public._ticket_office_balance_raw(_account_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sales AS (
    SELECT COALESCE(SUM(COALESCE(s.total_value, s.quantity * s.unit_price)), 0)::numeric AS total
      FROM public.ticket_sales s
     WHERE s.financial_account_id = _account_id
  ),
  txns AS (
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
    SELECT COALESCE(SUM(COALESCE(a.amount, 0)), 0)::numeric AS total
      FROM public.event_ticket_office_advances a
     WHERE a.financial_account_id = _account_id
       AND a.transaction_id IS NULL
       AND a.settlement_id IS NULL
  )
  SELECT ROUND(sales.total + txns.total - advances.total, 2)
    FROM sales, txns, advances;
$function$;

COMMENT ON FUNCTION public._ticket_office_balance_raw(uuid) IS
  'Interna. Espelho exacto de computeTicketOfficeBalance (total), arredondado a 2 casas apenas no total. Sem portão de permissão — chamar sempre via public.ticket_office_balances.';

REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ticket_office_balance_raw(uuid) TO service_role;
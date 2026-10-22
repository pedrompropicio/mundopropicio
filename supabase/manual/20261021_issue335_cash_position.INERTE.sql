-- LOCAL/INERTE 2k. Separate Sim required; never installed in Live.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regclass('public.transaction_offset_items') IS NULL THEN RAISE EXCEPTION 'installation_order: storage_required'; END IF;
 IF to_regprocedure('public.issue335_context_valid(text)') IS NULL THEN RAISE EXCEPTION 'installation_order: core_required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_event_cash_position(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(level text, event_id uuid, master_event_id uuid, parent_event_id uuid, event_name text, event_date date, is_sub boolean, realized numeric, committed numeric, pending numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  -- issue335-cash-position-v2l
  IF p_company_id IS DISTINCT FROM public.current_company_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: company mismatch';
  END IF;

  RETURN QUERY
  WITH liquid AS (
    -- Contas líquidas com controlo de saldo. skip_balance_check = saldo não é
    -- número e por isso a conta fica fora da posição de caixa (issue #90).
    SELECT fa.id, fa.initial_balance_date
    FROM financial_accounts fa
    WHERE fa.company_id = p_company_id
      AND fa.type IN ('bank', 'cash', 'prepaid_card')
      AND COALESCE(fa.skip_balance_check, false) = false
  ),
  managed AS (
    SELECT DISTINCT i.transaction_id
    FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id
    WHERE g.status IN ('preparing','applied','reversing')
      AND EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id
        AND p.offset_item_id=i.id AND p.transaction_id=i.transaction_id AND p.status='paid' AND p.reversed_at IS NULL)
  ),
  tx AS (
    SELECT t.id, t.event_id, t.type, t.status,
           t.amount, t.paid_amount, t.payment_date, t.date,
           l.initial_balance_date
    FROM transactions t
    JOIN liquid l ON l.id = t.account_id
    WHERE t.company_id = p_company_id
  ),
  paid_agg AS (
    SELECT tx.event_id,
           SUM(CASE WHEN tx.type = 'income' THEN tx.paid_amount
                    ELSE -tx.paid_amount END) AS paid_signed
    FROM tx
    WHERE NOT EXISTS (SELECT 1 FROM managed m WHERE m.transaction_id=tx.id)
      AND (p_date_from IS NULL OR (tx.payment_date IS NOT NULL AND tx.payment_date >= p_date_from))
      AND (p_date_to   IS NULL OR (tx.payment_date IS NOT NULL AND tx.payment_date <= p_date_to))
      -- Data de corte do saldo inicial: o que é anterior já está no saldo inicial.
      AND (tx.initial_balance_date IS NULL
           OR COALESCE(tx.payment_date, tx.date) > tx.initial_balance_date)
    GROUP BY tx.event_id
    UNION ALL
    SELECT t.event_id,sum(CASE WHEN t.type='income' THEN p.amount ELSE -p.amount END)
    FROM public.transaction_payments p JOIN public.transactions t ON t.id=p.transaction_id
    JOIN managed m ON m.transaction_id=t.id JOIN liquid l ON l.id=p.account_id
    WHERE t.company_id=p_company_id AND p.status='paid' AND p.reversed_at IS NULL
      AND p.payment_method<>'compensation'
      AND (p_date_from IS NULL OR p.payment_date>=p_date_from)
      AND (p_date_to IS NULL OR p.payment_date<=p_date_to)
      AND (l.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>l.initial_balance_date)
    GROUP BY t.event_id
  ),
  paid_total AS (SELECT event_id,sum(paid_signed) AS paid_signed FROM paid_agg GROUP BY event_id),
  adj_agg AS (
    SELECT t.event_id,
           SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0)) AS adj
    FROM transaction_payments p
    JOIN transactions t ON t.id = p.transaction_id
    JOIN liquid l ON l.id = p.account_id
    WHERE t.company_id = p_company_id
      AND (p_date_from IS NULL OR (COALESCE(p.payment_date, t.payment_date) >= p_date_from))
      AND (p_date_to   IS NULL OR (COALESCE(p.payment_date, t.payment_date) <= p_date_to))
      AND (l.initial_balance_date IS NULL
           OR COALESCE(p.payment_date, t.payment_date, t.date) > l.initial_balance_date)
    GROUP BY t.event_id
  ),
  committed_agg AS (
    SELECT tx.event_id,
           SUM(CASE WHEN tx.type = 'income' THEN (tx.amount - tx.paid_amount)
                    ELSE -(tx.amount - tx.paid_amount) END) AS committed
    FROM tx
    WHERE tx.status = 'approved'
    GROUP BY tx.event_id
  ),
  pending_agg AS (
    SELECT tx.event_id,
           SUM(CASE WHEN tx.type = 'income' THEN tx.amount
                    ELSE -tx.amount END) AS pending
    FROM tx
    WHERE tx.status = 'pending'
    GROUP BY tx.event_id
  ),
  keys AS (
    SELECT event_id FROM paid_agg
    UNION SELECT event_id FROM adj_agg
    UNION SELECT event_id FROM committed_agg
    UNION SELECT event_id FROM pending_agg
  )
  SELECT
    CASE WHEN k.event_id IS NULL THEN 'common' ELSE 'event' END,
    k.event_id,
    COALESCE(e.parent_event_id, e.id),
    e.parent_event_id,
    COALESCE(e.name, 'Comuns'),
    e.date,
    (e.parent_event_id IS NOT NULL),
    ROUND((COALESCE(pa.paid_signed, 0) + COALESCE(aa.adj, 0))::numeric, 2),
    ROUND(COALESCE(ca.committed, 0)::numeric, 2),
    ROUND(COALESCE(pe.pending, 0)::numeric, 2)
  FROM keys k
  LEFT JOIN events        e  ON e.id = k.event_id
  LEFT JOIN paid_total    pa ON pa.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN adj_agg       aa ON aa.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN committed_agg ca ON ca.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN pending_agg   pe ON pe.event_id IS NOT DISTINCT FROM k.event_id
  ORDER BY (k.event_id IS NULL), e.date NULLS LAST, e.name;
END;
$function$
;
COMMIT;

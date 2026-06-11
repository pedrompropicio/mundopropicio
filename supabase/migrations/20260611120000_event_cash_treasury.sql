-- =============================================================================
-- FASE 1 — Tesouraria entre eventos: Posição no Pool (Secção A)
-- =============================================================================
-- Camada de tesouraria que corre EM PARALELO ao resultado. NÃO altera DRE, BP,
-- Acerto de Sócios nem Resultado. Apenas introduz uma função derivada (zero
-- tabelas novas, zero alterações a tabelas existentes).
--
-- get_event_cash_position(company_id, date_from?, date_to?) devolve, por evento,
-- a posição líquida do evento contra o pool de caixa da empresa, ESPELHANDO a
-- lógica de computeBalance() (src/pages/FinancialAccounts.tsx) +
-- account-balance.ts, particionada por event_id.
--
-- Convenção espelhada do computeBalance():
--   saldo(conta) = initial_balance
--                + Σ paid_amount onde type='income'
--                − Σ paid_amount onde type<>'income' (expense/transfer/…)
--                + Σ (withholding_amount + credit_amount) das parcelas da conta
--
-- Nota de esquema (verificado em Test 2026-06-11): a tabela `transactions` NÃO
-- tem coluna `target_account_id` e NÃO existem linhas type='transfer'. O
-- movimento de transferência (ex.: fecho de bilheteira) é registado numa única
-- transação no lado de ORIGEM (account_id). Logo, a posição no pool espelha
-- exatamente o computeBalance: income soma, tudo o resto subtrai, por conta de
-- ORIGEM. Contas ticket_office ficam FORA do pool (não são contas líquidas).
--
-- INVARIANTE DE FECHO (acumulado, sem filtro de data):
--   Σ realized(todos os eventos) + Comuns + Σ initial_balance(contas líquidas)
--     = Σ computeBalance(contas líquidas)
-- Validado por get_event_cash_position_invariant().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Posição no pool por evento
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_cash_position(
  p_company_id uuid,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL
)
RETURNS TABLE (
  level           text,      -- 'event' | 'common'
  event_id        uuid,      -- NULL na linha Comuns
  master_event_id uuid,      -- coalesce(parent_event_id, id) para consolidação Master
  parent_event_id uuid,      -- NULL se for Master/simples
  event_name      text,      -- 'Comuns' na linha de custos comuns
  event_date      date,
  is_sub          boolean,   -- true se for sub-evento (tem parent)
  realized        numeric,   -- caixa já movimentado no pool (paid + ajustes) — entra no invariante
  committed       numeric,   -- approved não pago: (amount − paid_amount) com sinal — timing (não entra no invariante)
  pending         numeric    -- pending: amount com sinal — menor certeza (não entra no invariante)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  -- Isolamento multi-tenant: só a própria empresa (ou platform admin).
  IF p_company_id IS DISTINCT FROM public.current_company_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: company mismatch';
  END IF;

  RETURN QUERY
  WITH liquid AS (
    SELECT fa.id
    FROM financial_accounts fa
    WHERE fa.company_id = p_company_id
      AND fa.type IN ('bank', 'cash', 'prepaid_card')
  ),
  tx AS (
    SELECT t.id, t.event_id, t.type, t.status,
           t.amount, t.paid_amount, t.payment_date
    FROM transactions t
    WHERE t.company_id = p_company_id
      AND t.account_id IN (SELECT id FROM liquid)
  ),
  -- Realizado (parcela paga, com sinal) — filtrável por payment_date.
  paid_agg AS (
    SELECT tx.event_id,
           SUM(CASE WHEN tx.type = 'income' THEN tx.paid_amount
                    ELSE -tx.paid_amount END) AS paid_signed
    FROM tx
    WHERE (p_date_from IS NULL OR (tx.payment_date IS NOT NULL AND tx.payment_date >= p_date_from))
      AND (p_date_to   IS NULL OR (tx.payment_date IS NOT NULL AND tx.payment_date <= p_date_to))
    GROUP BY tx.event_id
  ),
  -- Ajustes de caixa (IRS retido + crédito de fornecedor) — sempre add-back (+),
  -- atribuídos ao event_id da transação a que a parcela pertence; conta da
  -- parcela tem de ser líquida (mesma convenção do account-balance.ts).
  adj_agg AS (
    SELECT t.event_id,
           SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0)) AS adj
    FROM transaction_payments p
    JOIN transactions t ON t.id = p.transaction_id
    WHERE t.company_id = p_company_id
      AND p.account_id IN (SELECT id FROM liquid)
      AND (p_date_from IS NULL OR (COALESCE(p.payment_date, t.payment_date) >= p_date_from))
      AND (p_date_to   IS NULL OR (COALESCE(p.payment_date, t.payment_date) <= p_date_to))
    GROUP BY t.event_id
  ),
  -- Comprometido: approved ainda não pago (timing). Sempre estado atual (não
  -- filtrado por data, pois ainda não tem payment_date).
  committed_agg AS (
    SELECT tx.event_id,
           SUM(CASE WHEN tx.type = 'income' THEN (tx.amount - tx.paid_amount)
                    ELSE -(tx.amount - tx.paid_amount) END) AS committed
    FROM tx
    WHERE tx.status = 'approved'
    GROUP BY tx.event_id
  ),
  -- Pendente: menor certeza. Estado atual.
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
  LEFT JOIN paid_agg      pa ON pa.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN adj_agg       aa ON aa.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN committed_agg ca ON ca.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN pending_agg   pe ON pe.event_id IS NOT DISTINCT FROM k.event_id
  ORDER BY (k.event_id IS NULL), e.date NULLS LAST, e.name;
END;
$$;

COMMENT ON FUNCTION public.get_event_cash_position(uuid, date, date) IS
  'FASE 1 Tesouraria: posição líquida de cada evento contra o pool de caixa '
  '(contas bank/cash/prepaid_card). Espelha computeBalance()+account-balance.ts '
  'particionado por event_id. event_id NULL = linha Comuns. Não altera DRE/BP/Resultado.';

-- -----------------------------------------------------------------------------
-- Validação do invariante de fecho (acumulado)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_cash_position_invariant(
  p_company_id uuid
)
RETURNS TABLE (
  sum_realized        numeric,  -- Σ realized de todos os eventos + Comuns
  sum_initial         numeric,  -- Σ initial_balance das contas líquidas
  lhs                 numeric,  -- sum_realized + sum_initial
  rhs_computebalance  numeric,  -- Σ computeBalance das contas líquidas
  diff                numeric,  -- lhs − rhs (deve ser 0)
  is_balanced         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  SELECT COALESCE(SUM(fa.initial_balance), 0) INTO v_sum_initial
  FROM financial_accounts fa
  WHERE fa.company_id = p_company_id
    AND fa.type IN ('bank', 'cash', 'prepaid_card');

  -- computeBalance() por conta líquida, somado (espelha FinancialAccounts.tsx)
  SELECT COALESCE(SUM(bal), 0) INTO v_rhs
  FROM (
    SELECT fa.initial_balance
         + COALESCE((
             SELECT SUM(CASE WHEN t.type = 'income' THEN t.paid_amount
                             ELSE -t.paid_amount END)
             FROM transactions t
             WHERE t.account_id = fa.id
           ), 0)
         + COALESCE((
             SELECT SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0))
             FROM transaction_payments p
             WHERE p.account_id = fa.id
           ), 0) AS bal
    FROM financial_accounts fa
    WHERE fa.company_id = p_company_id
      AND fa.type IN ('bank', 'cash', 'prepaid_card')
  ) s;

  RETURN QUERY
  SELECT ROUND(v_sum_realized, 2),
         ROUND(v_sum_initial, 2),
         ROUND(v_sum_realized + v_sum_initial, 2),
         ROUND(v_rhs, 2),
         ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2),
         (ROUND((v_sum_realized + v_sum_initial) - v_rhs, 2) = 0);
END;
$$;

COMMENT ON FUNCTION public.get_event_cash_position_invariant(uuid) IS
  'FASE 1 Tesouraria: testa o invariante de fecho — Σ realized + Σ initial '
  '(contas líquidas) deve igualar Σ computeBalance das contas líquidas.';

-- -----------------------------------------------------------------------------
-- GRANTs (mesma convenção das restantes RPCs)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_event_cash_position(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_cash_position_invariant(uuid) TO authenticated;

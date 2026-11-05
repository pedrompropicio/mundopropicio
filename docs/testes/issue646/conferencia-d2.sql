-- #646 D2-c: executar com a sessão/empresa MP e o mesmo perfil do ecrã.
-- Parâmetro obrigatório :company_id (uuid); sem acesso a Live pelo executor.
-- Uma instrução, um snapshot. Ano corrente em Lisboa; tempo real, sem filtro de datas.
-- Valores de receita líquidos; vendas por bilheteira brutas. Não confundir receita,
-- resultado do motor, caixa e retido. O resultado/selos conferem-se no ecrã, não há
-- réplica SQL do motor. Receitas DRE: regime caixa; com vendas e por transações
-- em colunas separadas, para explicitar o seletor da DRE Empresarial.
-- Tipo contabilístico = Todos e todas as linhas de negócio; receitas empresariais
-- (rubricas iniciadas por 10) não são receitas operacionais do evento.
WITH
params AS (
  SELECT :company_id::uuid AS company_id,
    (current_timestamp AT TIME ZONE 'Europe/Lisbon')::date AS reference_date,
    extract(year FROM current_timestamp AT TIME ZONE 'Europe/Lisbon')::integer AS ano
),
stages AS MATERIALIZED (SELECT * FROM public.event_stage_list()),
cash AS MATERIALIZED (
  SELECT c.* FROM params p
  CROSS JOIN LATERAL public.get_event_cash_position(p.company_id, NULL::date, NULL::date) c
),
position AS MATERIALIZED (
  SELECT public.get_financial_position_base(p.company_id, NULL::integer) AS base FROM params p
),
events AS (
  SELECT e.id, e.name, e.parent_event_id, coalesce(e.parent_event_id, e.id) AS master_id,
    m.name AS master_name, coalesce(s.stage, 'indisponível') AS stage,
    bl.name AS business_line,
    coalesce(s.stage IN ('planeamento', 'em_curso', 'em_fecho', 'fechado'), false) AS included
  FROM public.events e JOIN params p ON e.company_id = p.company_id
  JOIN public.events m ON m.id = coalesce(e.parent_event_id, e.id) AND m.company_id = p.company_id
  LEFT JOIN stages s ON s.event_id = m.id
  LEFT JOIN public.business_lines bl ON bl.id = m.business_line_id AND bl.company_id = p.company_id
),
accounts AS (
  SELECT a.* FROM public.financial_accounts a JOIN params p ON a.company_id = p.company_id
),
tx AS (
  SELECT t.*, a.name AS account_name, a.type AS account_type,
    a.type IN ('bank', 'cash', 'prepaid_card') AND NOT coalesce(a.skip_balance_check, false) AS liquid,
    CASE WHEN t.type = 'income' THEN 1 ELSE -1 END AS sign,
    coalesce(t.amount, 0) - coalesce(t.paid_amount, 0) AS unpaid,
    coalesce(t.payment_date, t.due_date, t.date) AS dre_date,
    ac.code AS category_code
  FROM public.transactions t JOIN params p ON t.company_id = p.company_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN public.account_categories ac ON ac.id = t.category_id
),
status_by_account AS (
  SELECT event_id, account_id, account_name, account_type, liquid, status,
    count(*) AS n, sum(unpaid) AS unpaid, sum(sign * unpaid) AS unpaid_signed,
    sum(sign * amount) AS amount_signed,
    count(*) FILTER (WHERE reversed_at IS NOT NULL OR is_hidden) AS n_reversed_or_hidden
  FROM tx WHERE status IN ('approved', 'partially_paid', 'pending') AND unpaid > 0
  GROUP BY event_id, account_id, account_name, account_type, liquid, status
),
status_by_event AS (
  SELECT event_id,
    count(*) FILTER (WHERE status = 'approved') AS approved_n,
    coalesce(sum(unpaid) FILTER (WHERE status = 'approved'), 0) AS approved_unpaid,
    count(*) FILTER (WHERE status = 'partially_paid') AS partially_paid_n,
    coalesce(sum(unpaid) FILTER (WHERE status = 'partially_paid'), 0) AS partially_paid_unpaid,
    count(*) FILTER (WHERE status = 'pending') AS pending_n,
    coalesce(sum(unpaid) FILTER (WHERE status = 'pending'), 0) AS pending_unpaid,
    coalesce(sum(sign * unpaid) FILTER (WHERE liquid AND status = 'partially_paid'), 0) AS partial_missing_from_rpc
  FROM tx WHERE status IN ('approved', 'partially_paid', 'pending') AND unpaid > 0
  GROUP BY event_id
),
rpc_expected AS (
  -- Inclui também saldos negativos de approved e pending totalmente pagos,
  -- porque o RPC não limita a agregação ao saldo positivo.
  SELECT event_id,
    coalesce(sum(sign * unpaid) FILTER (WHERE liquid AND status = 'approved'), 0) AS committed,
    coalesce(sum(sign * amount) FILTER (WHERE liquid AND status = 'pending'), 0) AS pending
  FROM tx GROUP BY event_id
),
dre_tx AS (
  SELECT t.event_id, sum(t.amount) AS revenue_transactions,
    coalesce(sum(t.amount) FILTER (WHERE coalesce(t.category_code, '') <> '1.1.01'), 0) AS revenue_without_ticket_category
  FROM tx t CROSS JOIN params p
  WHERE t.event_id IS NOT NULL AND coalesce(t.category_code, '') NOT LIKE '10%'
    AND t.type = 'income' AND t.status IN ('approved', 'paid')
    AND t.reversed_at IS NULL AND NOT coalesce(t.is_hidden, false)
    AND NOT coalesce(t.is_transitory, false) AND NOT coalesce(t.exclude_from_result, false)
    AND (t.event_settlement_id IS NULL OR EXISTS (
      SELECT 1 FROM public.event_settlements s
      WHERE s.id = t.event_settlement_id AND s.parent_id IS NULL
    ))
    AND extract(year FROM t.dre_date)::integer = p.ano
  GROUP BY t.event_id
),
dre_sales AS (
  -- Mesma ligação lote -> zona e IVA por lote de ReportDREEmpresarial.
  SELECT z.event_id,
    sum(coalesce(s.total_value, s.quantity * s.unit_price) / (1 + coalesce(l.iva_rate, 6) / 100.0)) AS revenue_net
  FROM public.ticket_sales s
  JOIN public.event_ticket_lots l ON l.id = s.lot_id
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  JOIN events e ON e.id = z.event_id CROSS JOIN params p
  WHERE extract(year FROM s.sale_date)::integer = p.ano
  GROUP BY z.event_id
),
offices AS (SELECT * FROM accounts WHERE type = 'ticket_office'),
canonical_retained AS MATERIALIZED (
  SELECT b.* FROM public.ticket_office_balances((SELECT coalesce(array_agg(id), '{}'::uuid[]) FROM offices)) b
),
sales AS MATERIALIZED (
  SELECT o.id AS account_id, s.* FROM offices o
  CROSS JOIN LATERAL public.get_ticket_office_sales(o.id) s
),
assignments AS (
  SELECT DISTINCT a.event_id, a.financial_account_id AS account_id
  FROM public.event_ticket_office_assignments a JOIN offices o ON o.id = a.financial_account_id
),
office_movements AS (
  SELECT event_id, account_id, sum(CASE WHEN type = 'income' THEN paid_amount
    WHEN type IN ('expense', 'transfer') THEN -paid_amount ELSE 0 END) AS delta
  FROM tx WHERE account_type = 'ticket_office' AND status IN ('approved', 'paid')
    AND reversed_at IS NULL AND NOT coalesce(is_hidden, false)
  GROUP BY event_id, account_id
),
advances AS (
  SELECT a.event_id, a.financial_account_id AS account_id, sum(a.amount) AS amount
  FROM public.event_ticket_office_advances a JOIN offices o ON o.id = a.financial_account_id
  WHERE a.transaction_id IS NULL AND a.settlement_id IS NULL
  GROUP BY a.event_id, a.financial_account_id
),
office_keys AS (
  SELECT event_id, account_id FROM assignments
  UNION SELECT event_id, account_id FROM sales
  UNION SELECT event_id, account_id FROM office_movements
  UNION SELECT event_id, account_id FROM advances
),
retained_detail AS (
  SELECT k.event_id, k.account_id, o.name, a.event_id IS NOT NULL AS assigned,
    coalesce(s.quantity, 0) AS quantity, coalesce(s.revenue, 0) AS sales_gross,
    coalesce(m.delta, 0) AS movements, coalesce(ad.amount, 0) AS advances,
    CASE WHEN a.event_id IS NOT NULL AND b.balance IS NOT NULL
      THEN coalesce(s.revenue, 0) + coalesce(m.delta, 0) - coalesce(ad.amount, 0)
      ELSE NULL END AS retained_by_event,
    b.balance AS canonical_account_balance
  FROM office_keys k JOIN offices o ON o.id = k.account_id
  LEFT JOIN assignments a ON a.account_id = k.account_id AND a.event_id = k.event_id
  LEFT JOIN sales s ON s.account_id = k.account_id AND s.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN office_movements m ON m.account_id = k.account_id AND m.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN advances ad ON ad.account_id = k.account_id AND ad.event_id IS NOT DISTINCT FROM k.event_id
  LEFT JOIN canonical_retained b ON b.account_id = k.account_id
),
reconciliation AS (
  SELECT
    (SELECT coalesce(sum(initial_balance), 0) FROM accounts
      WHERE type IN ('bank', 'cash', 'prepaid_card') AND NOT coalesce(skip_balance_check, false)) AS opening_liquid,
    (SELECT coalesce(sum(realized), 0) FROM cash) AS realized_all,
    (SELECT coalesce(sum(c.realized), 0) FROM cash c JOIN events e ON e.id = c.event_id WHERE e.included) AS realized_in_bridge,
    (SELECT coalesce(sum(c.realized), 0) FROM cash c JOIN events e ON e.id = c.event_id WHERE NOT e.included) AS realized_excluded,
    (SELECT coalesce(sum(realized), 0) FROM cash WHERE level = 'common') AS realized_common,
    (SELECT jsonb_agg(jsonb_build_object('account_id', a.id, 'name', a.name,
      'initial_balance', a.initial_balance, 'initial_balance_date', a.initial_balance_date,
      'first_statement_from', (SELECT min(bs.period_from) FROM public.bank_statements bs WHERE bs.financial_account_id = a.id AND bs.company_id = a.company_id)))
      FROM accounts a WHERE a.type IN ('bank', 'cash', 'prepaid_card') AND NOT coalesce(a.skip_balance_check, false)) AS cutoffs
),
universe AS (
  SELECT id, name, master_id, master_name, parent_event_id, stage, business_line, included FROM events
  UNION ALL SELECT NULL::uuid, 'Comuns', NULL::uuid, NULL::text, NULL::uuid, 'sem evento', NULL::text, false
)
SELECT p.reference_date, p.ano, u.*,
  CASE WHEN u.id IS NULL THEN 'Comuns: fora do total de eventos'
    WHEN u.included THEN 'Estágio elegível do Master'
    ELSE 'Estágio do Master fora do perímetro: ' || u.stage END AS perimeter_reason,
  coalesce(c.committed, 0) AS rpc_committed, coalesce(c.realized, 0) AS rpc_realized,
  coalesce(c.pending, 0) AS rpc_pending,
  (SELECT jsonb_agg(jsonb_build_object('transaction_id', leg.transaction_id,
    'account_id', leg.account_id, 'account_name', a.name,
    'withholding_amount', leg.withholding_amount, 'credit_amount', leg.credit_amount,
    'payment_date', leg.payment_date,
    'liquid', coalesce(a.type IN ('bank', 'cash', 'prepaid_card') AND NOT coalesce(a.skip_balance_check, false), false),
    'after_initial_balance', a.initial_balance_date IS NULL OR coalesce(leg.payment_date, t.payment_date, t.date) > a.initial_balance_date))
    FROM public.transaction_payments leg JOIN tx t ON t.id = leg.transaction_id
    LEFT JOIN accounts a ON a.id = leg.account_id
    WHERE t.event_id IS NOT DISTINCT FROM u.id) AS cash_payment_adjustments,
  coalesce(st.approved_n, 0) AS approved_n, coalesce(st.approved_unpaid, 0) AS approved_unpaid,
  coalesce(st.partially_paid_n, 0) AS partially_paid_n, coalesce(st.partially_paid_unpaid, 0) AS partially_paid_unpaid,
  coalesce(st.pending_n, 0) AS pending_n, coalesce(st.pending_unpaid, 0) AS pending_unpaid,
  coalesce(re.committed, 0) AS committed_expected_rpc,
  coalesce(st.partial_missing_from_rpc, 0) AS partial_missing_from_rpc,
  coalesce(re.pending, 0) AS pending_expected_rpc,
  (SELECT jsonb_agg(to_jsonb(sa) - 'event_id') FROM status_by_account sa WHERE sa.event_id IS NOT DISTINCT FROM u.id) AS unpaid_by_account,
  (SELECT jsonb_agg(to_jsonb(rd) - 'event_id') FROM retained_detail rd WHERE rd.event_id IS NOT DISTINCT FROM u.id) AS ticket_offices,
  coalesce(dt.revenue_transactions, 0) AS revenue_year_dre_transactions,
  coalesce(ds.revenue_net, 0) AS revenue_year_ticket_sales,
  coalesce(dt.revenue_without_ticket_category, 0) + coalesce(ds.revenue_net, 0) AS revenue_year_dre_with_sales,
  pos.base AS financial_position_same_snapshot,
  to_jsonb(r) AS cash_reconciliation,
  r.opening_liquid + r.realized_all AS reconstructed_liquid,
  (pos.base #>> '{posicao,caixa_e_cartoes}')::numeric AS position_liquid,
  r.opening_liquid + r.realized_all - (pos.base #>> '{posicao,caixa_e_cartoes}')::numeric AS liquid_difference,
  (SELECT jsonb_agg(jsonb_build_object('account_id', o.id, 'name', o.name, 'canonical_balance', b.balance,
    'attributed_to_events', (SELECT sum(rd.retained_by_event) FROM retained_detail rd WHERE rd.account_id = o.id),
    'residual', b.balance - coalesce((SELECT sum(rd.retained_by_event) FROM retained_detail rd WHERE rd.account_id = o.id), 0)))
    FROM offices o LEFT JOIN canonical_retained b ON b.account_id = o.id) AS retained_reconciliation
FROM universe u CROSS JOIN params p CROSS JOIN position pos CROSS JOIN reconciliation r
LEFT JOIN cash c ON c.event_id IS NOT DISTINCT FROM u.id
LEFT JOIN status_by_event st ON st.event_id IS NOT DISTINCT FROM u.id
LEFT JOIN rpc_expected re ON re.event_id IS NOT DISTINCT FROM u.id
LEFT JOIN dre_tx dt ON dt.event_id IS NOT DISTINCT FROM u.id
LEFT JOIN dre_sales ds ON ds.event_id = u.id
ORDER BY u.master_name NULLS LAST, u.parent_event_id NULLS FIRST, u.name;

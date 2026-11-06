-- #341 E2b — PROVA PREPARADA, NÃO EXECUTADA EM BASE EXTERNA.
-- Apenas o 0 executa na janela autorizada com Sim. Guardar os resultados por parte.
-- Executar ANTES; aplicar a 0309 separadamente pelo PROC-promocao; executar DEPOIS;
-- só depois executar SIMULAÇÃO (sempre ROLLBACK). Não aplicar a migração neste ficheiro.
-- Nenhum dado é reconstruído. Nenhum INSERT/UPDATE/DELETE neste guião.

-- PARTE: ANTES
SELECT e.id, e.company_id, e.name, e.parent_event_id, e.historical_at
  FROM public.events e WHERE e.historical_at IS NOT NULL ORDER BY e.company_id, e.id;

-- Universo exacto do diagnóstico 6612268569, sem corte bancário adicional:
-- importação declarativa sob decisão 6612516798; referência Live 157 (155 despesas, 2 receitas).
SELECT t.company_id, c.display_name AS company_name, t.event_id, e.name AS event_name, t.type,
       count(*) AS transaction_count,
       sum(t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0)) AS gross_sum,
       sum(t.paid_amount) AS paid_sum, min(t.payment_date) AS first_payment_date,
       max(t.payment_date) AS last_payment_date
  FROM public.transactions t
  LEFT JOIN public.companies c ON c.id = t.company_id
  LEFT JOIN public.events e ON e.id = t.event_id
 WHERE t.status = 'paid'
   AND COALESCE(t.is_reimbursement, false) = false
   AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
 GROUP BY t.company_id, c.display_name, t.event_id, e.name, t.type
 ORDER BY t.company_id, t.event_id, t.type;

-- Depois da 0309: current_count=0 e reference_count=0 esperados no universo Live medido.
SELECT * FROM public._run_invariant_checks_paid();

-- Guardar este hash antes e comparar depois; inclui TODAS as transações, sem filtros.
SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(t.id, t.status, t.paid_amount, t.payment_date)
                              ORDER BY t.id)::text, '[]')) AS transactions_md5
  FROM public.transactions t;

-- Intersecção das 157 com o predicado c10 da 0052; não altera a vigia de bruto.
SELECT count(*) AS diagnostic_paid_amount_acima_do_bruto
  FROM public.transactions t
 WHERE t.status = 'paid'
   AND COALESCE(t.is_reimbursement, false) = false
   AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
   AND t.paid_amount IS NOT NULL
   AND t.paid_amount > ROUND(t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0), 2) + 0.02;

-- Subeventos: carimbo do master não concede a excepção da 0309.
SELECT t.id, t.company_id, t.event_id, e.name AS event_name,
       e.historical_at AS own_historical_at, master.id AS master_id,
       master.historical_at AS master_historical_at, t.paid_amount, t.payment_date
  FROM public.transactions t
  JOIN public.events e ON e.id = t.event_id
  JOIN public.events master ON master.id = e.parent_event_id
 WHERE t.status = 'paid' AND master.historical_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
 ORDER BY t.company_id, t.event_id, t.id;

-- PARTE: DEPOIS
SELECT e.id, e.company_id, e.name, e.parent_event_id, e.historical_at
  FROM public.events e WHERE e.historical_at IS NOT NULL ORDER BY e.company_id, e.id;

-- Universo exacto do diagnóstico 6612268569, sem corte bancário adicional:
-- importação declarativa sob decisão 6612516798; referência Live 157 (155 despesas, 2 receitas).
SELECT t.company_id, c.display_name AS company_name, t.event_id, e.name AS event_name, t.type,
       count(*) AS transaction_count,
       sum(t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0)) AS gross_sum,
       sum(t.paid_amount) AS paid_sum, min(t.payment_date) AS first_payment_date,
       max(t.payment_date) AS last_payment_date
  FROM public.transactions t
  LEFT JOIN public.companies c ON c.id = t.company_id
  LEFT JOIN public.events e ON e.id = t.event_id
 WHERE t.status = 'paid'
   AND COALESCE(t.is_reimbursement, false) = false
   AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
 GROUP BY t.company_id, c.display_name, t.event_id, e.name, t.type
 ORDER BY t.company_id, t.event_id, t.type;

-- Depois da 0309: current_count=0 e reference_count=0 esperados no universo Live medido.
SELECT * FROM public._run_invariant_checks_paid();

-- Guardar este hash antes e comparar depois; inclui TODAS as transações, sem filtros.
SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(t.id, t.status, t.paid_amount, t.payment_date)
                              ORDER BY t.id)::text, '[]')) AS transactions_md5
  FROM public.transactions t;

-- Intersecção das 157 com o predicado c10 da 0052; não altera a vigia de bruto.
SELECT count(*) AS diagnostic_paid_amount_acima_do_bruto
  FROM public.transactions t
 WHERE t.status = 'paid'
   AND COALESCE(t.is_reimbursement, false) = false
   AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
   AND t.paid_amount IS NOT NULL
   AND t.paid_amount > ROUND(t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0), 2) + 0.02;

-- Subeventos: carimbo do master não concede a excepção da 0309.
SELECT t.id, t.company_id, t.event_id, e.name AS event_name,
       e.historical_at AS own_historical_at, master.id AS master_id,
       master.historical_at AS master_historical_at, t.paid_amount, t.payment_date
  FROM public.transactions t
  JOIN public.events e ON e.id = t.event_id
  JOIN public.events master ON master.id = e.parent_event_id
 WHERE t.status = 'paid' AND master.historical_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
 ORDER BY t.company_id, t.event_id, t.id;

-- PARTE: SIMULAÇÃO
BEGIN;
-- Os dois hashes têm de coincidir após a 0309 no universo histórico medido (157).
SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(t.id, t.status, t.paid_amount, t.payment_date)
                              ORDER BY t.id)::text, '[]')) AS transactions_md5
  FROM public.transactions t;
SELECT t.id, public._derive_paid_amount(t.id)
  FROM public.transactions t
 WHERE t.status = 'paid'
   AND COALESCE(t.is_reimbursement, false) = false
   AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
 ORDER BY t.id;
SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(t.id, t.status, t.paid_amount, t.payment_date)
                              ORDER BY t.id)::text, '[]')) AS transactions_md5
  FROM public.transactions t;
ROLLBACK;

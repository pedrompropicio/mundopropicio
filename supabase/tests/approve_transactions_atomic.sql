-- Prova da aprovação atómica (D-ERP173, incidente 05/10/2026).
-- Corre dentro de BEGIN … ROLLBACK: não deixa nada na base.
BEGIN;

-- Despesa pendente real, com linha de BP, sem pai e sem isenções.
CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT t.id, t.forecast_id, t.amount
FROM public.transactions t
WHERE t.status IN ('pending', 'overdue') AND t.type = 'expense'
  AND t.forecast_id IS NOT NULL AND t.parent_transaction_id IS NULL
  AND t.amount > 0
  AND coalesce(t.is_transitory, false) = false AND coalesce(t.exclude_from_result, false) = false
  AND t.reversed_at IS NULL AND coalesce(t.is_hidden, false) = false AND t.shared_cost_account_id IS NULL
LIMIT 1;

-- Força excesso: verba da linha = 0.
UPDATE public.event_forecasts SET amount = 0 WHERE id = (SELECT forecast_id FROM _alvo);

-- (ii) sem raises e com excesso → P0409 e nada gravado.
SAVEPOINT s_ii;
DO $$
BEGIN
  PERFORM public.approve_transactions_atomic(ARRAY[(SELECT id FROM _alvo)], '[]'::jsonb, 'teste');
  RAISE EXCEPTION 'FALHOU: devia ter dado P0409';
EXCEPTION WHEN SQLSTATE 'P0409' THEN
  RAISE NOTICE 'ii OK: P0409 (%)', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT s_ii;
SELECT 'ii' AS caso, t.status, f.amount AS verba,
       (SELECT count(*) FROM public.transaction_audit_log a WHERE a.transaction_id = t.id AND a.changed_by = 'teste') AS auditorias
FROM public.transactions t JOIN public.event_forecasts f ON f.id = t.forecast_id
WHERE t.id = (SELECT id FROM _alvo);

-- (i) duas chamadas para o mesmo id com raise → 1 aprova e eleva, a outra skipped.
CREATE TEMP TABLE _r ON COMMIT DROP AS
SELECT 1 AS n, public.approve_transactions_atomic(
  ARRAY[(SELECT id FROM _alvo)],
  jsonb_build_array(jsonb_build_object('forecast_id', (SELECT forecast_id FROM _alvo), 'new_amount', 9999999, 'observation', 'teste')),
  'teste') AS res;
INSERT INTO _r SELECT 2, public.approve_transactions_atomic(
  ARRAY[(SELECT id FROM _alvo)],
  jsonb_build_array(jsonb_build_object('forecast_id', (SELECT forecast_id FROM _alvo), 'new_amount', 19999999, 'observation', 'teste')),
  'teste');

SELECT 'i' AS caso, n, res->'approved_ids' AS aprovados, res->'skipped_ids' AS ignorados,
       jsonb_array_length(res->'applied_raises') AS raises FROM _r ORDER BY n;
SELECT 'i' AS caso, t.status, f.amount AS verba,
       (SELECT count(*) FROM public.forecast_audit_log l WHERE l.forecast_id = f.id AND l.changed_by = 'teste') AS elevacoes,
       (SELECT count(*) FROM public.transaction_audit_log a WHERE a.transaction_id = t.id AND a.changed_by = 'teste' AND a.field_name = 'status') AS aud_status,
       (SELECT count(*) FROM public.transaction_audit_log a WHERE a.transaction_id = t.id AND a.changed_by = 'teste' AND a.field_name = 'bp_budget_raised') AS aud_raise
FROM public.transactions t JOIN public.event_forecasts f ON f.id = t.forecast_id
WHERE t.id = (SELECT id FROM _alvo);

ROLLBACK;

-- Issue #646 D2-f — pacote de janela 0342, só SELECT. Não executar pelo E2b.
-- :company_id obrigatório, sessão da mesma empresa e sem movimentos concorrentes.
-- 1. Guardar §1, §2 e §3a ANTES (incluindo snapshot_0342 e is_balanced).
-- 2. O 0 aplica a 0342 com «Sim». Não aplicar se §1 não indicar por_aplicar.
-- 3. Repetir §2/§3a DEPOIS. Em §3b, :before_0342 é o JSON snapshot_0342 ANTES.
--    Colar resultados e diferença total na #646. A diferença deve ser a soma
--    partially_paid_unpaid_signed, com realized/pending iguais e invariantes true.
-- 4. Publish do ERP só DEPOIS da 0342. Em /erp/tesouraria, conferir a linha 2
--    de um evento parcial: alteração igual ao saldo por pagar com sinal.

-- §1 — pré-estado. por_aplicar = true antes, false depois.
WITH definition AS (
  SELECT pg_get_functiondef('public.get_event_cash_position(uuid,date,date)'::regprocedure) AS body
)
SELECT :company_id::uuid = public.current_company_id() AS same_company,
  body LIKE '%WHERE tx.status = ''approved''%' AS approved_only,
  body NOT LIKE '%partially_paid%' AS without_partially_paid,
  body LIKE '%WHERE tx.status = ''approved''%' AND body NOT LIKE '%partially_paid%' AS por_aplicar,
  md5(body) AS definition_md5
FROM definition;

-- §2 — executar ANTES e DEPOIS, por evento e Comuns, sempre em tempo real.
-- A soma usa amount - paid_amount sem coalesce: NULL não soma em nenhum estado.
WITH cash AS MATERIALIZED (
  SELECT * FROM public.get_event_cash_position(:company_id::uuid, NULL::date, NULL::date)
), signed AS (
  SELECT t.event_id,
    coalesce(sum(CASE WHEN t.type = 'income' THEN t.amount - t.paid_amount
      ELSE -(t.amount - t.paid_amount) END) FILTER (WHERE t.status = 'approved'), 0) AS approved_unpaid_signed,
    coalesce(sum(CASE WHEN t.type = 'income' THEN t.amount - t.paid_amount
      ELSE -(t.amount - t.paid_amount) END) FILTER (WHERE t.status = 'partially_paid'), 0) AS partially_paid_unpaid_signed
  FROM public.transactions t
  JOIN public.financial_accounts a ON a.id = t.account_id
    AND a.company_id = :company_id::uuid
    AND a.type IN ('bank', 'cash', 'prepaid_card')
    AND NOT coalesce(a.skip_balance_check, false)
  WHERE t.company_id = :company_id::uuid
  GROUP BY t.event_id
), comparison AS (
  SELECT c.level, c.event_id, c.event_name, c.committed, c.realized, c.pending,
    coalesce(s.approved_unpaid_signed, 0) AS approved_unpaid_signed,
    coalesce(s.partially_paid_unpaid_signed, 0) AS partially_paid_unpaid_signed
  FROM cash c LEFT JOIN signed s ON s.event_id IS NOT DISTINCT FROM c.event_id
)
SELECT *, committed = round(approved_unpaid_signed, 2) AS matches_before,
  committed = round(approved_unpaid_signed + partially_paid_unpaid_signed, 2) AS matches_after,
  sum(committed) OVER () AS committed_total,
  sum(partially_paid_unpaid_signed) OVER () AS expected_total_difference
FROM comparison
ORDER BY (event_id IS NULL), event_id;

-- §3a — guardar o JSON ANTES e DEPOIS. Um snapshot por instrução, sem escrita.
WITH cash AS MATERIALIZED (
  SELECT * FROM public.get_event_cash_position(:company_id::uuid, NULL::date, NULL::date)
), invariant AS MATERIALIZED (
  SELECT * FROM public.get_event_cash_position_invariant(:company_id::uuid)
)
SELECT jsonb_build_object('company_id', :company_id::uuid,
  'cash', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY (c.event_id IS NULL), c.event_id) FROM cash c), '[]'::jsonb),
  'invariant', (SELECT to_jsonb(i) FROM invariant i)) AS snapshot_0342,
  (SELECT is_balanced FROM invariant) AS is_balanced;

-- §3b — DEPOIS, fornecer :before_0342 (snapshot_0342 guardado em §3a ANTES).
-- Cada linha e o total devem conferir. Snapshot de outra empresa nunca valida.
WITH before_state AS (
  SELECT :before_0342::jsonb AS snapshot
), before_cash AS (
  SELECT c.* FROM before_state b CROSS JOIN LATERAL jsonb_to_recordset(b.snapshot -> 'cash')
    AS c(level text, event_id uuid, committed numeric, realized numeric, pending numeric)
), after_cash AS MATERIALIZED (
  SELECT * FROM public.get_event_cash_position(:company_id::uuid, NULL::date, NULL::date)
), invariant AS MATERIALIZED (
  SELECT * FROM public.get_event_cash_position_invariant(:company_id::uuid)
), expected AS (
  SELECT coalesce(sum(CASE WHEN t.type = 'income' THEN t.amount - t.paid_amount
    ELSE -(t.amount - t.paid_amount) END), 0) AS partial_total
  FROM public.transactions t JOIN public.financial_accounts a ON a.id = t.account_id
    AND a.company_id = :company_id::uuid
    AND a.type IN ('bank', 'cash', 'prepaid_card') AND NOT coalesce(a.skip_balance_check, false)
  WHERE t.company_id = :company_id::uuid AND t.status = 'partially_paid'
), comparison AS (
  SELECT coalesce(b.level, a.level) AS level, coalesce(b.event_id, a.event_id) AS event_id,
    b.committed AS committed_before, a.committed AS committed_after,
    a.committed - b.committed AS committed_difference,
    b.realized AS realized_before, a.realized AS realized_after,
    b.pending AS pending_before, a.pending AS pending_after,
    b.level IS NOT NULL AND a.level IS NOT NULL
      AND b.realized = a.realized AND b.pending = a.pending AS realized_pending_unchanged
  FROM before_cash b FULL JOIN after_cash a
    ON b.level = a.level AND coalesce(b.event_id::text, 'common') = coalesce(a.event_id::text, 'common')
)
SELECT c.*,
  :company_id::uuid = public.current_company_id()
    AND (b.snapshot ->> 'company_id')::uuid = :company_id::uuid AS same_company,
  (b.snapshot #>> '{invariant,is_balanced}')::boolean AS invariant_before_balanced,
  i.is_balanced AS invariant_after_balanced,
  sum(c.committed_difference) OVER () AS committed_total_difference,
  e.partial_total AS expected_total_difference,
  sum(c.committed_difference) OVER () = e.partial_total AS total_difference_matches
FROM comparison c CROSS JOIN before_state b CROSS JOIN invariant i CROSS JOIN expected e
ORDER BY (c.event_id IS NULL), c.event_id;

-- §4 — informativo ANTES/DEPOIS: estes NULL não somam, tal como em approved.
SELECT count(*) AS partially_paid_null_paid_amount,
  count(*) FILTER (WHERE a.type IN ('bank', 'cash', 'prepaid_card')
    AND NOT coalesce(a.skip_balance_check, false)) AS in_liquid_accounts
FROM public.transactions t
LEFT JOIN public.financial_accounts a ON a.id = t.account_id AND a.company_id = :company_id::uuid
WHERE t.company_id = :company_id::uuid AND t.status = 'partially_paid' AND t.paid_amount IS NULL;

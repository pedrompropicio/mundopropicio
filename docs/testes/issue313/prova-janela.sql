-- #313 — prova para a janela do 0; preparada, não executada nesta entrega.
-- O SQL executável deste ficheiro contém só SELECTs.

-- §1 — antes do CREATE: esperadas 0 linhas de pares duplicados.
-- Predicado da medição de 21/10/2026 (comentário 6374487495).
SELECT financial_account_id, event_id, count(*)
FROM public.ticket_office_settlements
WHERE coalesce(status, '') <> 'reversed' AND event_id IS NOT NULL
GROUP BY financial_account_id, event_id
HAVING count(*) > 1;

-- Referência histórica: 9 fechos, 8 confirmed, 1 draft, 0 reversed.
-- Recolher novamente na janela; estes números não são um resultado actual.
SELECT status, count(*)
FROM public.ticket_office_settlements
GROUP BY status
ORDER BY status;

-- §2 — após o CREATE: esperados os dois índices, ambos indisvalid = true.
SELECT indexes.schemaname, indexes.tablename, indexes.indexname,
       indexes.indexdef, catalog.indisvalid
FROM pg_catalog.pg_indexes AS indexes
JOIN pg_catalog.pg_namespace AS namespace ON namespace.nspname = indexes.schemaname
JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = namespace.oid AND relation.relname = indexes.indexname
JOIN pg_catalog.pg_index AS catalog ON catalog.indexrelid = relation.oid
WHERE indexes.schemaname = 'public'
  AND indexes.tablename = 'ticket_office_settlements'
  AND indexes.indexname IN (
    'ux_settlements_office_event_confirmed',
    'ux_settlements_office_event_active'
  )
ORDER BY indexes.indexname;

-- §3 — SÓ EM HOMOLOG, após aplicar a 0317: descomentar apenas este bloco.
-- Executar como operador autorizado no SQL Editor, numa sessão com permissão
-- de INSERT e pelo menos um fecho activo; sem fecho activo, a prova é inconclusiva.
-- Esperado no INSERT: SQLSTATE 23505, ux_settlements_office_event_active.
-- Depois do erro, executar SEMPRE o ROLLBACK na mesma sessão; nunca COMMIT.
-- BEGIN;
-- INSERT INTO public.ticket_office_settlements (
--   financial_account_id, event_id, company_id, settlement_date, created_by, status
-- )
-- SELECT financial_account_id, event_id, company_id, settlement_date, created_by, 'draft'
-- FROM public.ticket_office_settlements
-- WHERE status <> 'reversed'
-- ORDER BY id
-- LIMIT 1;
-- ROLLBACK;

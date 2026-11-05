-- 0317 — #313: um só fecho activo por bilheteira+evento (rascunho ou confirmado).
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização de preparação: 6621057545; aplicação pelo 0 na janela autorizada.
-- Medição Live de 21/10/2026, comentário 6374487495: 0 pares activos duplicados
-- em 9 fechos (8 confirmed, 1 draft 5c871a42…, 0 reversed); não é uma nova consulta.
-- status e event_id são NOT NULL; status <> 'reversed' cobre draft e confirmed.
-- Mantém ux_settlements_office_event_confirmed; os estornados não contam.
-- Sem CONCURRENTLY: CREATE INDEX CONCURRENTLY não pode correr numa transacção;
-- tanto o PROC como db.exec executam este ficheiro numa só transacção.
-- Uma falha de CREATE INDEX CONCURRENTLY pode deixar um índice INVALID.
-- Com cerca de 9 linhas, espera-se que o lock do CREATE normal dure milissegundos.
-- Rollback: supabase/manual/rollback_0317_issue313_settlements_unique_active_comentado.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT financial_account_id, event_id, count(*)
    FROM public.ticket_office_settlements
    WHERE status <> 'reversed' AND event_id IS NOT NULL
    GROUP BY financial_account_id, event_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '#313: há fechos activos duplicados por bilheteira+evento; resolver antes de criar o índice';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_settlements_office_event_active
ON public.ticket_office_settlements (financial_account_id, event_id)
WHERE status <> 'reversed';

COMMENT ON INDEX public.ux_settlements_office_event_active IS
  '#313: apenas um fecho activo (rascunho ou confirmado) por bilheteira+evento; estornados excluídos.';

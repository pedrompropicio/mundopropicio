-- 0348 — #303 R8: direito documental e fecho por evento congelado.
-- PREPARADA, NÃO APLICADA. Autorização 6666841381; reserva 6678942328.
-- Ordem de aplicação coordenada: 0323 → 0317 → 0345 → 0346 → 0347 → 0348.
-- Compatível também sem 0323/0317: só acrescenta triggers; não substitui RPCs.
-- Não activa contas, não reconcilia histórico e não cria movimentos financeiros.
-- As guardas anteriores de fontes/recibos continuam em vigor, sem alterações.
-- Rollback: supabase/manual/rollback_0348_issue303_event_guards_comentado.sql.
BEGIN;

-- VOLATILE: depois do lock, a consulta vê uma confirmação que tenha terminado
-- enquanto o escritor esperava. Confirmação R3/R4 usa a mesma conta e evento.
-- Não depende da flag actual: uma pertença confirmada nunca se descongela.
CREATE OR REPLACE FUNCTION issue303_private.assert_event_unfrozen(
  p_company uuid, p_account uuid, p_event uuid, p_operation text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.financial_accounts
    WHERE id = p_account AND company_id = p_company FOR UPDATE;
  PERFORM 1 FROM public.events
    WHERE id = p_event AND company_id = p_company FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.ticket_office_statement_events e
    JOIN public.ticket_office_statements s ON s.id = e.statement_id
      AND s.company_id = e.company_id AND s.financial_account_id = e.financial_account_id
    WHERE e.event_id = p_event AND e.company_id = p_company
      AND e.financial_account_id = p_account AND s.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'issue303_event_frozen: evento pertence a apuramento confirmado; operação % recusada. Acertos exigem documento novo ligado ao original.', p_operation
      USING ERRCODE = '55000';
  END IF;
END $$;
REVOKE ALL ON FUNCTION issue303_private.assert_event_unfrozen(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION issue303_private.event_settlement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r record;
BEGIN
  -- Verificar OLD e NEW: mover o fecho de evento/conta/empresa não é um bypass.
  -- Bloqueia também metadados: uma correcção Q4 não regrava o documento original.
  -- Todos os locks de conta precedem os de evento, ordenados por UUID.
  PERFORM 1 FROM public.financial_accounts
    WHERE id IN (OLD.financial_account_id, NEW.financial_account_id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.events
    WHERE id IN (OLD.event_id, NEW.event_id) ORDER BY id FOR UPDATE;
  FOR r IN SELECT DISTINCT company_id, financial_account_id, event_id FROM (
    SELECT OLD.company_id, OLD.financial_account_id, OLD.event_id WHERE TG_OP <> 'INSERT'
    UNION ALL
    SELECT NEW.company_id, NEW.financial_account_id, NEW.event_id WHERE TG_OP <> 'DELETE'
  ) refs ORDER BY financial_account_id, event_id LOOP
    PERFORM issue303_private.assert_event_unfrozen(r.company_id,r.financial_account_id,r.event_id,TG_OP);
  END LOOP;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION issue303_private.event_settlement_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION issue303_private.event_transfer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE ids uuid[]; r record;
BEGIN
  -- A entrada do par não tem settlement_id: resolver também a operation_key
  -- canónica, sempre na empresa do fecho. Abrange escrita directa e as duas
  -- versões de create_settlement_transfer, sem mudar os seus corpos/ACL.
  SELECT array_agg(DISTINCT s.id) INTO ids FROM public.ticket_office_settlements s
  JOIN (
    SELECT OLD.company_id, OLD.settlement_id, OLD.operation_key WHERE TG_OP <> 'INSERT'
    UNION ALL
    SELECT NEW.company_id, NEW.settlement_id, NEW.operation_key WHERE TG_OP <> 'DELETE'
  ) t ON t.company_id = s.company_id AND t.operation_key LIKE 'TRF-FECHO-%'
    AND (t.settlement_id = s.id OR t.operation_key =
      'TRF-FECHO-' || upper(substring(replace(s.id::text,'-','') FROM 1 FOR 8)));
  IF ids IS NOT NULL THEN
    PERFORM 1 FROM public.financial_accounts WHERE id IN (
      SELECT financial_account_id FROM public.ticket_office_settlements WHERE id = ANY(ids)
    ) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.events WHERE id IN (
      SELECT event_id FROM public.ticket_office_settlements WHERE id = ANY(ids)
    ) ORDER BY id FOR UPDATE;
    FOR r IN SELECT * FROM public.ticket_office_settlements WHERE id = ANY(ids)
      ORDER BY financial_account_id, event_id, id LOOP
      PERFORM issue303_private.assert_event_unfrozen(r.company_id,r.financial_account_id,r.event_id,'TRF-FECHO-' || TG_OP);
    END LOOP;
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION issue303_private.event_transfer_guard()
  FROM PUBLIC, anon, authenticated, service_role;

-- Nomes anteriores a issue303_source_write_guard: erro específico antes das
-- guardas genéricas. A excepção desfaz a RPC inteira, incluindo efeitos prévios
-- do estorno; não há necessidade de reescrever reverse_ticket_office_settlement.
DROP TRIGGER IF EXISTS issue303_event_settlement_guard ON public.ticket_office_settlements;
CREATE TRIGGER issue303_event_settlement_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_settlements
  FOR EACH ROW EXECUTE FUNCTION issue303_private.event_settlement_guard();
DROP TRIGGER IF EXISTS issue303_event_transfer_guard ON public.transactions;
CREATE TRIGGER issue303_event_transfer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION issue303_private.event_transfer_guard();

COMMIT;

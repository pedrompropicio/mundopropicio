-- ============================================================================
-- Coerência de rubrica BP <-> Transação: propagação em vez de bloqueio
-- ----------------------------------------------------------------------------
-- Regra: quando uma transação está vinculada por FK a uma linha de BP
-- (event_forecasts.transaction_id), A RUBRICA DA LINHA DE BP MANDA.
-- Os triggers antigos (enforce_tx_category_l2_match e
-- enforce_forecast_tx_link_l2_match) validavam apenas ao nível L2 e RECUSAVAM
-- a escrita. Isso deixava passar divergências dentro do mesmo L2
-- (2.6.08 vs 2.6.04, 2.9.01 vs 2.9.03, 3.1.01 vs 3.1.06) e obrigava a
-- corrigir os pares em duas instruções numa ordem específica.
-- Agora a comparação é de igualdade EXACTA de category_id (L3) e o
-- comportamento é realinhar em silêncio, do lado da transação.
--
-- RESSALVA IMPORTANTE (issue #29) — ler antes de mexer:
-- Esta regra assume o modelo actual de vínculo 1:1
-- (event_forecasts.transaction_id -> transactions.id). Quando a issue #29
-- trouxer a camada de alocação do realizado (uma fatura a cobrir várias linhas
-- de BP; uma linha paga em várias transações), a rubrica da transação deixa de
-- poder seguir UMA única linha e ESTES DOIS TRIGGERS TÊM DE SER REVISTOS ou
-- substituídos pela tabela de alocação. Ver docs/DECISIONS.md.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_enforce_tx_category_l2_match ON public.transactions;
DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_link_l2_match ON public.event_forecasts;

-- validate_tx_category_l2_match() é mantida de propósito: deixa de ser chamada
-- por triggers, mas continua disponível para relatórios/diagnóstico.

-- ---------------------------------------------------------------------------
-- Lado BP: a linha manda -> arrasta a rubrica da transação vinculada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_tx_category_from_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_cat uuid;
  v_company uuid;
BEGIN
  -- Anti-recursão: só reagimos a escritas de nível 1 (ver nota no topo da migração).
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  -- Snapshots de versões do BP não propagam nada.
  IF NEW.version_id IS NOT NULL THEN RETURN NULL; END IF;
  IF NEW.transaction_id IS NULL OR NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT category_id, company_id INTO v_old_cat, v_company
    FROM public.transactions WHERE id = NEW.transaction_id;

  IF v_old_cat IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  -- Realinhamento automático: NÃO tocar em updated_at (não é edição humana).
  UPDATE public.transactions
     SET category_id = NEW.category_id
   WHERE id = NEW.transaction_id
     AND category_id IS DISTINCT FROM NEW.category_id;

  IF v_company IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.transaction_id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', v_old_cat),
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('forecast_id', NEW.id, 'source', 'trigger', 'direction', 'forecast_to_tx'),
            v_company);
  END IF;

  RETURN NULL;
END $function$;

CREATE TRIGGER trg_sync_tx_category_from_forecast
AFTER INSERT OR UPDATE OF category_id, transaction_id ON public.event_forecasts
FOR EACH ROW EXECUTE FUNCTION public.sync_tx_category_from_forecast();

-- ---------------------------------------------------------------------------
-- Lado transação: se alguém muda a rubrica de uma TX reclamada por FK,
-- realinha de volta para a rubrica da linha de BP (a linha manda).
-- A UI deve impedir esta edição (campo read-only no TransactionEditModal);
-- este trigger é a rede para escritas por SQL/edge functions/importadores.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.realign_tx_category_from_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_forecast RECORD;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT id, category_id INTO v_forecast
    FROM public.event_forecasts
   WHERE transaction_id = NEW.id
     AND version_id IS NULL
     AND category_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_forecast.id IS NULL THEN RETURN NULL; END IF;
  IF v_forecast.category_id IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  UPDATE public.transactions
     SET category_id = v_forecast.category_id
   WHERE id = NEW.id;

  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('category_id', v_forecast.category_id),
            jsonb_build_object('forecast_id', v_forecast.id, 'source', 'trigger', 'direction', 'tx_to_forecast'),
            NEW.company_id);
  END IF;

  RETURN NULL;
END $function$;

CREATE TRIGGER trg_realign_tx_category_from_forecast
AFTER UPDATE OF category_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.realign_tx_category_from_forecast();
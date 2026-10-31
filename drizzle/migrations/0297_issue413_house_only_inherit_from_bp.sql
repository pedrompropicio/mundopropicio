-- 0297 — #413 (seguimento da #404): "Fora do acerto do sócio" herdado da linha de BP.
-- Decisão do Pedro (31/10/2026): a linha de BP manda. Uma transação com forecast_id herda
-- excluded_from_partner_settlement da sua linha de BP; só uma receita sem linha de BP tem marca própria.
-- Classe R2. Executor: 7 · Fecho e Sócios. Aplicação: 0 · Cowork pelo PROC-promocao
-- (mp-homolog-3 → Live com "Sim" do Pedro). Só DDL, sem DML: em 31/10/2026 Live já está coerente
-- (0 transações com marca diferente da sua linha de BP; 2 TX + 2 BP marcadas, ligadas entre si).
-- Mantém as guardas da 0296: CHECKs (só receitas; incompatível com exclude_from_result,
-- is_transitory, is_overhead e event_settlement_id) e fechamento selado no evento ou no Master.
-- Transação incompatível ligada a uma linha marcada fica sem marca (nunca bloqueia a operação).
-- Rollback: supabase/manual/rollback_0297_issue413_house_only_inherit_from_bp_comentado.sql

-- 1) Transação: herda da linha de BP ao inserir, ao mudar forecast_id e ao mudar o que a torna
--    (in)compatível. Uma transação incompatível (despesa, fora do resultado, transitória ou exclusiva
--    de um fechamento) fica sempre sem marca, mesmo com a linha marcada, para nunca violar os CHECKs.
--    Com linha de BP, mudar a marca na própria transação é recusado.
CREATE OR REPLACE FUNCTION public.inherit_house_only_from_forecast()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_bp boolean; v_val boolean; v_master uuid;
BEGIN
  IF NEW.forecast_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT f.excluded_from_partner_settlement INTO v_bp
    FROM public.event_forecasts f WHERE f.id = NEW.forecast_id;
  v_val := COALESCE(v_bp, false)
           AND NEW.type = 'income'
           AND NOT NEW.exclude_from_result
           AND NOT NEW.is_transitory
           AND NEW.event_settlement_id IS NULL;
  IF TG_OP = 'UPDATE'
     AND NEW.forecast_id IS NOT DISTINCT FROM OLD.forecast_id
     AND NEW.excluded_from_partner_settlement IS DISTINCT FROM OLD.excluded_from_partner_settlement
     AND NEW.excluded_from_partner_settlement IS DISTINCT FROM v_val THEN
    RAISE EXCEPTION 'Fora do acerto do sócio: herdado da linha do BP. Mude a marca na linha do BP.';
  END IF;
  NEW.excluded_from_partner_settlement := v_val;
  IF NEW.event_id IS NOT NULL
     AND ((TG_OP = 'INSERT' AND v_val)
       OR (TG_OP = 'UPDATE' AND NEW.excluded_from_partner_settlement IS DISTINCT FROM OLD.excluded_from_partner_settlement)) THEN
    SELECT e.parent_event_id INTO v_master FROM public.events e WHERE e.id = NEW.event_id;
    IF EXISTS (
      SELECT 1 FROM public.event_settlements s
      WHERE COALESCE(s.is_sealed, false)
        AND (s.event_id = NEW.event_id OR (v_master IS NOT NULL AND s.event_id = v_master))
    ) THEN
      RAISE EXCEPTION 'Fechamento selado: não é possível mudar "Fora do acerto do sócio". Reabra primeiro.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.inherit_house_only_from_forecast() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inherit_house_only_from_forecast() FROM anon;

CREATE TRIGGER trg_inherit_house_only_from_forecast
  BEFORE INSERT OR UPDATE OF forecast_id, excluded_from_partner_settlement, type, exclude_from_result, is_transitory, event_settlement_id
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.inherit_house_only_from_forecast();

-- 2) Linha de BP: ao mudar a marca, propaga às transações compatíveis com forecast_id = linha.
--    As incompatíveis ficam sem marca (já estão fora do resultado ou não são receita).
CREATE OR REPLACE FUNCTION public.propagate_house_only_to_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.excluded_from_partner_settlement IS NOT DISTINCT FROM OLD.excluded_from_partner_settlement THEN
    RETURN NULL;
  END IF;
  UPDATE public.transactions t
     SET excluded_from_partner_settlement = NEW.excluded_from_partner_settlement
   WHERE t.forecast_id = NEW.id
     AND t.type = 'income'
     AND NOT t.exclude_from_result
     AND NOT t.is_transitory
     AND t.event_settlement_id IS NULL
     AND t.excluded_from_partner_settlement IS DISTINCT FROM NEW.excluded_from_partner_settlement;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.propagate_house_only_to_transactions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.propagate_house_only_to_transactions() FROM anon;

CREATE TRIGGER trg_propagate_house_only_to_transactions
  AFTER UPDATE OF excluded_from_partner_settlement ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.propagate_house_only_to_transactions();

-- 0296 — #404: receita fora do acerto do sócio, dentro do resultado do evento.
-- Classe R2. Executor: 7 · Fecho e Sócios. Aplicação: 0 · Cowork, primeiro no mp-homolog-3,
-- depois em Live com "Sim" do Pedro. Só DDL: nenhuma linha é marcada aqui (DML das 4 linhas
-- da Turnê Simone Mendes 2026 só depois do Publish, com "Corro?").
-- Rollback: supabase/manual/rollback_0296_issue404_excluded_from_partner_settlement_comentado.sql

-- 1) Colunas (default false: nenhum número muda com esta migração)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS excluded_from_partner_settlement boolean NOT NULL DEFAULT false;
ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS excluded_from_partner_settlement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.excluded_from_partner_settlement IS
  'Receita só da MP (#404): conta no resultado do evento e fica fora da base repartida com os sócios no Fechamento.';
COMMENT ON COLUMN public.event_forecasts.excluded_from_partner_settlement IS
  'Linha de BP de receita só da MP (#404): conta no resultado do evento e fica fora da base repartida com os sócios no Fechamento.';

-- 2) Coerência: só receitas; incompatível com fora do resultado, transitória e exclusivo de fechamento
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_excluded_from_partner_settlement_check
  CHECK (
    NOT excluded_from_partner_settlement
    OR (type = 'income' AND NOT exclude_from_result AND NOT is_transitory AND event_settlement_id IS NULL)
  );
ALTER TABLE public.event_forecasts
  ADD CONSTRAINT event_forecasts_excluded_from_partner_settlement_check
  CHECK (
    NOT excluded_from_partner_settlement
    OR (type = 'income' AND NOT exclude_from_result AND NOT is_transitory AND NOT is_overhead AND event_settlement_id IS NULL)
  );

-- 3) Guarda do selo: não se muda a marca com um fechamento selado no evento ou no Master
CREATE OR REPLACE FUNCTION public.guard_excluded_from_partner_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_master uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.excluded_from_partner_settlement IS NOT DISTINCT FROM OLD.excluded_from_partner_settlement THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NOT NEW.excluded_from_partner_settlement THEN
    RETURN NEW;
  END IF;
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT parent_event_id INTO v_master FROM public.events WHERE id = NEW.event_id;
  IF EXISTS (
    SELECT 1 FROM public.event_settlements s
    WHERE COALESCE(s.is_sealed, false)
      AND (s.event_id = NEW.event_id OR (v_master IS NOT NULL AND s.event_id = v_master))
  ) THEN
    RAISE EXCEPTION 'Fechamento selado: não é possível mudar "Fora do acerto do sócio". Reabra primeiro.';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.guard_excluded_from_partner_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_excluded_from_partner_settlement() FROM anon;

CREATE TRIGGER trg_guard_excluded_from_partner_settlement
  BEFORE INSERT OR UPDATE OF excluded_from_partner_settlement ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_excluded_from_partner_settlement();
CREATE TRIGGER trg_guard_forecast_excluded_from_partner_settlement
  BEFORE INSERT OR UPDATE OF excluded_from_partner_settlement ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.guard_excluded_from_partner_settlement();

NOTIFY pgrst, 'reload schema';

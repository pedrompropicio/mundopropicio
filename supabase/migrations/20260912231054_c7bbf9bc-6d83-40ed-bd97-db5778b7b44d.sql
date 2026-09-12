ALTER TABLE public.event_forecasts
  ADD COLUMN event_settlement_id uuid REFERENCES public.event_settlements(id) ON DELETE SET NULL;
ALTER TABLE public.transactions
  ADD COLUMN event_settlement_id uuid REFERENCES public.event_settlements(id) ON DELETE SET NULL;

CREATE INDEX idx_event_forecasts_event_settlement
  ON public.event_forecasts(event_settlement_id) WHERE event_settlement_id IS NOT NULL;
CREATE INDEX idx_transactions_event_settlement
  ON public.transactions(event_settlement_id) WHERE event_settlement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_forecast_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid;
BEGIN
  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  SELECT event_id INTO v_event FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Apuramento % não existe', NEW.event_settlement_id;
  END IF;
  IF NEW.event_id IS NULL OR NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A linha do BP só pode ser ligada a um apuramento do próprio evento';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_forecast_event_settlement
  BEFORE INSERT OR UPDATE OF event_settlement_id, event_id ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.validate_forecast_event_settlement();

CREATE OR REPLACE FUNCTION public.validate_transaction_event_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid;
BEGIN
  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'Uma transação sem evento (mãe de rateio) não pode ser ligada a um apuramento';
  END IF;
  SELECT event_id INTO v_event FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Apuramento % não existe', NEW.event_settlement_id;
  END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A transação só pode ser ligada a um apuramento do próprio evento';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_transaction_event_settlement
  BEFORE INSERT OR UPDATE OF event_settlement_id, event_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_event_settlement();

CREATE OR REPLACE FUNCTION public.prevent_delete_event_settlement_with_lines()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n_f int; n_t int;
BEGIN
  SELECT count(*) INTO n_f FROM public.event_forecasts WHERE event_settlement_id = OLD.id;
  SELECT count(*) INTO n_t FROM public.transactions WHERE event_settlement_id = OLD.id;
  IF n_f + n_t > 0 THEN
    RAISE EXCEPTION 'Não é possível apagar o apuramento "%": tem % linha(s) de BP e % transação(ões) ligadas', OLD.name, n_f, n_t;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER prevent_delete_event_settlement_with_lines
  BEFORE DELETE ON public.event_settlements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_event_settlement_with_lines();
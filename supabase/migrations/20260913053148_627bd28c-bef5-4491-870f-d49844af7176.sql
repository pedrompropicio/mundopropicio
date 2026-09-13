ALTER TABLE public.event_forecasts
  ADD COLUMN addback_settlement_id uuid NULL REFERENCES public.event_settlements(id) ON DELETE SET NULL,
  ADD COLUMN addback_reason text;

ALTER TABLE public.event_forecasts
  ADD CONSTRAINT event_forecasts_addback_xor_perimeter
  CHECK (addback_settlement_id IS NULL OR event_settlement_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_event_forecasts_addback_settlement
  ON public.event_forecasts (addback_settlement_id)
  WHERE addback_settlement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_forecast_addback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_settlement_event uuid;
  v_parent uuid;
  v_sealed boolean;
BEGIN
  IF NEW.addback_settlement_id IS NULL THEN
    NEW.addback_reason := NULL;
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.type, '')) <> 'expense' THEN
    RAISE EXCEPTION 'Só linhas de despesa podem ser devolvidas a um fechamento.';
  END IF;

  IF NEW.addback_reason IS NULL OR btrim(NEW.addback_reason) = '' THEN
    RAISE EXCEPTION 'Indique o motivo da devolução da linha ao fechamento.';
  END IF;

  SELECT s.event_id, s.parent_id, coalesce(s.is_sealed, false)
    INTO v_settlement_event, v_parent, v_sealed
  FROM public.event_settlements s
  WHERE s.id = NEW.addback_settlement_id;

  IF v_settlement_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento de devolução inexistente.';
  END IF;

  IF v_settlement_event <> NEW.event_id THEN
    RAISE EXCEPTION 'O fechamento de devolução tem de pertencer ao mesmo evento da linha.';
  END IF;

  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Não é possível devolver uma linha ao fechamento raiz.';
  END IF;

  IF v_sealed THEN
    RAISE EXCEPTION 'O fechamento de devolução está selado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_forecast_addback ON public.event_forecasts;
CREATE TRIGGER trg_validate_forecast_addback
  BEFORE INSERT OR UPDATE OF addback_settlement_id, addback_reason, type, event_id
  ON public.event_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_forecast_addback();
-- Re-aplicação Fase 1: colunas em events em falta
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS absorbs_admin_costs boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS admin_window_start date;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS admin_window_end date;

-- Recriar trigger (idempotente)
CREATE OR REPLACE FUNCTION public.validate_event_admin_absorption()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.absorbs_admin_costs = true THEN
    IF NEW.parent_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas eventos Master ou Single podem absorver custos administrativos (Splits não).';
    END IF;
    IF NEW.admin_window_start IS NULL OR NEW.admin_window_end IS NULL THEN
      RAISE EXCEPTION 'Janela de absorção (admin_window_start e admin_window_end) é obrigatória quando absorbs_admin_costs = true.';
    END IF;
    IF NEW.admin_window_start > NEW.admin_window_end THEN
      RAISE EXCEPTION 'admin_window_start deve ser <= admin_window_end.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_event_admin_absorption ON public.events;
CREATE TRIGGER trg_validate_event_admin_absorption
  BEFORE INSERT OR UPDATE OF absorbs_admin_costs, admin_window_start, admin_window_end, parent_event_id
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_event_admin_absorption();

CREATE INDEX IF NOT EXISTS idx_events_absorbs_admin_costs
  ON public.events (admin_window_start, admin_window_end)
  WHERE absorbs_admin_costs = true;
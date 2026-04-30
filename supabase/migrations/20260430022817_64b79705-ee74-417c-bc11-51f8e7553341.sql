ALTER TABLE public.account_categories
  ADD COLUMN IF NOT EXISTS allocate_to_active_event boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_account_categories_allocate_active
  ON public.account_categories (allocate_to_active_event)
  WHERE allocate_to_active_event = true;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS absorbs_admin_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_window_start date,
  ADD COLUMN IF NOT EXISTS admin_window_end date;

CREATE INDEX IF NOT EXISTS idx_events_absorbs_admin
  ON public.events (admin_window_start, admin_window_end)
  WHERE absorbs_admin_costs = true;

CREATE OR REPLACE FUNCTION public.validate_event_admin_absorption()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.absorbs_admin_costs = true AND NEW.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sub-eventos (Splits) não podem absorver custos administrativos. Apenas Master/Single.';
  END IF;
  IF NEW.admin_window_start IS NOT NULL AND NEW.admin_window_end IS NOT NULL THEN
    IF NEW.admin_window_end < NEW.admin_window_start THEN
      RAISE EXCEPTION 'admin_window_end (%) tem de ser >= admin_window_start (%)', NEW.admin_window_end, NEW.admin_window_start;
    END IF;
  END IF;
  IF NEW.absorbs_admin_costs = true THEN
    IF NEW.admin_window_start IS NULL OR NEW.admin_window_end IS NULL THEN
      RAISE EXCEPTION 'Eventos com absorbs_admin_costs=true precisam de admin_window_start e admin_window_end.';
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

CREATE OR REPLACE FUNCTION public.validate_category_allocate_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.allocate_to_active_event = true THEN
    IF NOT (NEW.code LIKE '10%' AND length(NEW.code) - length(replace(NEW.code, '.', '')) = 2) THEN
      RAISE EXCEPTION 'allocate_to_active_event só é permitido em categorias L3 do Group 10 (código ex.: 10.x.yy). Recebido: %', NEW.code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_category_allocate_flag ON public.account_categories;
CREATE TRIGGER trg_validate_category_allocate_flag
  BEFORE INSERT OR UPDATE OF allocate_to_active_event, code
  ON public.account_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_category_allocate_flag();
-- Fase 1: Suporte para alocação automática de custos administrativos a evento ativo

-- 1. Coluna em account_categories
ALTER TABLE public.account_categories
  ADD COLUMN IF NOT EXISTS allocate_to_active_event boolean NOT NULL DEFAULT false;

-- 2. Colunas em events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS absorbs_admin_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_window_start date,
  ADD COLUMN IF NOT EXISTS admin_window_end date;

-- 3. Trigger: só Master/Single podem absorver; janela coerente
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

-- 4. Trigger: flag só em L3 do Grupo 10
CREATE OR REPLACE FUNCTION public.validate_category_allocate_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.allocate_to_active_event = true THEN
    IF NEW.code !~ '^10\.[0-9]+\.[0-9]+$' THEN
      RAISE EXCEPTION 'allocate_to_active_event só pode ser ativado em subcategorias de nível 3 do Grupo 10 (formato 10.x.yy). Código atual: %', NEW.code;
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

-- 5. Índices parciais
CREATE INDEX IF NOT EXISTS idx_events_absorbs_admin_costs
  ON public.events (admin_window_start, admin_window_end)
  WHERE absorbs_admin_costs = true;

CREATE INDEX IF NOT EXISTS idx_account_categories_allocate_flag
  ON public.account_categories (id)
  WHERE allocate_to_active_event = true;
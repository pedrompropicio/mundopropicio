
-- Trigger 1: validar absorção de custos administrativos em eventos
CREATE OR REPLACE FUNCTION public.validate_event_admin_absorption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.absorbs_admin_costs = true THEN
    -- só Master ou Single (sem parent)
    IF NEW.parent_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas eventos Master ou Single podem absorver custos administrativos (não Splits).';
    END IF;
    -- janela obrigatória e coerente
    IF NEW.admin_window_start IS NULL OR NEW.admin_window_end IS NULL THEN
      RAISE EXCEPTION 'Quando absorbs_admin_costs=true, admin_window_start e admin_window_end são obrigatórios.';
    END IF;
    IF NEW.admin_window_end < NEW.admin_window_start THEN
      RAISE EXCEPTION 'admin_window_end não pode ser anterior a admin_window_start.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_event_admin_absorption ON public.events;
CREATE TRIGGER trg_validate_event_admin_absorption
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.validate_event_admin_absorption();

-- Trigger 2: validar flag allocate_to_active_event (só L3 do Grupo 10)
CREATE OR REPLACE FUNCTION public.validate_category_allocate_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.allocate_to_active_event = true THEN
    -- formato 10.x.yy (Nível 3 do Grupo 10)
    IF NEW.code !~ '^10\.[0-9]+\.[0-9]+$' THEN
      RAISE EXCEPTION 'allocate_to_active_event só pode ser ligado em categorias de Nível 3 do Grupo 10 (formato 10.x.yy). Código atual: %', NEW.code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_category_allocate_flag ON public.account_categories;
CREATE TRIGGER trg_validate_category_allocate_flag
BEFORE INSERT OR UPDATE ON public.account_categories
FOR EACH ROW
EXECUTE FUNCTION public.validate_category_allocate_flag();

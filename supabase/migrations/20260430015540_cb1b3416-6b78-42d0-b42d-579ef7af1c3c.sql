-- Fase 1: Schema para Custos Administrativos Absorvidos por Evento

-- 1) Flag na categoria
ALTER TABLE public.account_categories
  ADD COLUMN allocate_to_active_event BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_account_categories_allocate_to_active_event
  ON public.account_categories(allocate_to_active_event)
  WHERE allocate_to_active_event = true;

-- 2) Flags e janela no evento
ALTER TABLE public.events
  ADD COLUMN absorbs_admin_costs BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN admin_window_start DATE,
  ADD COLUMN admin_window_end DATE;

-- 3) Constraint: se absorve, datas obrigatórias e ordenadas
ALTER TABLE public.events
  ADD CONSTRAINT events_admin_window_required
  CHECK (
    NOT absorbs_admin_costs
    OR (
      admin_window_start IS NOT NULL
      AND admin_window_end IS NOT NULL
      AND admin_window_start <= admin_window_end
    )
  );

-- 4) Trigger: bloquear absorbs_admin_costs em Splits
CREATE OR REPLACE FUNCTION public.prevent_split_absorbs_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.absorbs_admin_costs = true AND NEW.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas eventos Master ou Single podem absorver custos administrativos. Splits (eventos com parent_event_id) não são permitidos.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_split_absorbs_admin
  BEFORE INSERT OR UPDATE OF absorbs_admin_costs, parent_event_id ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_split_absorbs_admin();

-- 5) Índice para procura por janela
CREATE INDEX idx_events_admin_window
  ON public.events(admin_window_start, admin_window_end, company_id)
  WHERE absorbs_admin_costs = true;

-- 6) RPC helper para o frontend descobrir eventos candidatos
CREATE OR REPLACE FUNCTION public.find_admin_absorbing_events(
  p_date DATE,
  p_company_id UUID
)
RETURNS TABLE (
  event_id UUID,
  event_name TEXT,
  event_date DATE,
  admin_window_start DATE,
  admin_window_end DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS event_id,
    e.name AS event_name,
    e.date AS event_date,
    e.admin_window_start,
    e.admin_window_end
  FROM public.events e
  WHERE e.absorbs_admin_costs = true
    AND e.company_id = p_company_id
    AND e.parent_event_id IS NULL
    AND e.status IN ('confirmed', 'active', 'completed')
    AND p_date BETWEEN e.admin_window_start AND e.admin_window_end
  ORDER BY ABS(e.date - p_date) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.find_admin_absorbing_events(DATE, UUID) TO authenticated;

COMMENT ON COLUMN public.account_categories.allocate_to_active_event IS
  'Quando true (apenas para L3 do Grupo 10), despesas desta categoria podem ser absorvidas por um evento âncora dentro da sua admin_window.';
COMMENT ON COLUMN public.events.absorbs_admin_costs IS
  'Marca o evento como âncora administrativa: absorve despesas do Grupo 10 (com flag) lançadas dentro da sua janela.';
COMMENT ON COLUMN public.events.admin_window_start IS
  'Data inicial da janela de absorção administrativa (default sugerido: data do evento − 10 meses).';
COMMENT ON COLUMN public.events.admin_window_end IS
  'Data final da janela de absorção administrativa (default sugerido: data do evento + 2 meses).';
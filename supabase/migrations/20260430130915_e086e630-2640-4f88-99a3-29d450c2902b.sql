
-- ============================================================================
-- Simulador (Entrega 3): inputs por (evento × dia × zona) + config A&B por zona
-- ============================================================================

-- 1) Config global do simulador por evento
CREATE TABLE IF NOT EXISTS public.event_simulator_config (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  -- Histórico do ano anterior (manual, opcional)
  prior_year_real_revenue numeric(14,2),
  prior_year_real_expenses numeric(14,2),
  prior_year_notes text,
  -- Defaults globais (fallback quando não há override por zona)
  default_drink_avg_ticket numeric(10,2) NOT NULL DEFAULT 10.51,
  default_food_avg_ticket numeric(10,2) NOT NULL DEFAULT 5.40,
  default_drink_cmv_pct numeric(5,2) NOT NULL DEFAULT 65.00,
  default_food_cmv_pct numeric(5,2) NOT NULL DEFAULT 75.00,
  -- Conversão público → consumo (taxa de conversão)
  default_drink_conversion_pct numeric(5,2) NOT NULL DEFAULT 100.00,
  default_food_conversion_pct numeric(5,2) NOT NULL DEFAULT 60.00,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Config A&B por zona (Pista, VIP, …) — granularidade por zona conforme decisão
CREATE TABLE IF NOT EXISTS public.event_simulator_zone_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  zone_label text NOT NULL,
  drink_avg_ticket numeric(10,2),         -- override do default_drink_avg_ticket
  food_avg_ticket numeric(10,2),
  drink_cmv_pct numeric(5,2),
  food_cmv_pct numeric(5,2),
  drink_conversion_pct numeric(5,2),
  food_conversion_pct numeric(5,2),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, zone_label)
);

-- 3) Inputs por (dia × zona) — matriz central do simulador
CREATE TABLE IF NOT EXISTS public.event_simulator_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  day_index int NOT NULL,                 -- 0-based índice do dia do evento
  day_date date,                          -- data efetiva (informativa)
  zone_label text NOT NULL,
  capacity_target int,                    -- capacidade da zona nesse dia
  projected_qty int NOT NULL DEFAULT 0,   -- bilhetes projetados (cenário base)
  break_even_qty_manual int,              -- override manual; se NULL usa sugestão
  courtesy_qty int NOT NULL DEFAULT 0,    -- cortesias previstas
  projected_revenue numeric(14,2),        -- receita bilheteira projetada (manual)
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, day_index, zone_label)
);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public._touch_simulator_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_event_simulator_config_touch
  BEFORE UPDATE ON public.event_simulator_config
  FOR EACH ROW EXECUTE FUNCTION public._touch_simulator_updated_at();

CREATE TRIGGER trg_event_simulator_zone_config_touch
  BEFORE UPDATE ON public.event_simulator_zone_config
  FOR EACH ROW EXECUTE FUNCTION public._touch_simulator_updated_at();

CREATE TRIGGER trg_event_simulator_inputs_touch
  BEFORE UPDATE ON public.event_simulator_inputs
  FOR EACH ROW EXECUTE FUNCTION public._touch_simulator_updated_at();

-- company_id auto-fill via evento
CREATE OR REPLACE FUNCTION public._set_simulator_company_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.events WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_event_simulator_config_set_company
  BEFORE INSERT ON public.event_simulator_config
  FOR EACH ROW EXECUTE FUNCTION public._set_simulator_company_id();

CREATE TRIGGER trg_event_simulator_zone_config_set_company
  BEFORE INSERT ON public.event_simulator_zone_config
  FOR EACH ROW EXECUTE FUNCTION public._set_simulator_company_id();

CREATE TRIGGER trg_event_simulator_inputs_set_company
  BEFORE INSERT ON public.event_simulator_inputs
  FOR EACH ROW EXECUTE FUNCTION public._set_simulator_company_id();

-- Indexes para queries frequentes
CREATE INDEX IF NOT EXISTS idx_event_simulator_inputs_event ON public.event_simulator_inputs(event_id);
CREATE INDEX IF NOT EXISTS idx_event_simulator_zone_event ON public.event_simulator_zone_config(event_id);
CREATE INDEX IF NOT EXISTS idx_event_simulator_inputs_company ON public.event_simulator_inputs(company_id);
CREATE INDEX IF NOT EXISTS idx_event_simulator_zone_company ON public.event_simulator_zone_config(company_id);
CREATE INDEX IF NOT EXISTS idx_event_simulator_config_company ON public.event_simulator_config(company_id);

-- ============================================================================
-- RLS — multi-tenant via current_company_id() + role check via has_role()
-- ============================================================================
ALTER TABLE public.event_simulator_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_simulator_zone_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_simulator_inputs ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer utilizador autenticado da mesma company
CREATE POLICY "simulator_config_select_same_company"
  ON public.event_simulator_config FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "simulator_zone_select_same_company"
  ON public.event_simulator_zone_config FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "simulator_inputs_select_same_company"
  ON public.event_simulator_inputs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- INSERT/UPDATE/DELETE: admin/manager/editor da mesma company
CREATE POLICY "simulator_config_write_staff"
  ON public.event_simulator_config FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ))
  WITH CHECK (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ));

CREATE POLICY "simulator_zone_write_staff"
  ON public.event_simulator_zone_config FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ))
  WITH CHECK (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ));

CREATE POLICY "simulator_inputs_write_staff"
  ON public.event_simulator_inputs FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ))
  WITH CHECK (company_id = public.current_company_id() AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  ));


-- 1) Inputs por sessão (dia × zona) — campos extra
ALTER TABLE public.event_simulator_inputs
  ADD COLUMN IF NOT EXISTS real_sales_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS real_sales_revenue numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_qty integer,
  ADD COLUMN IF NOT EXISTS avg_ticket_override numeric(10,4),
  ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS prior_year_qty integer,
  ADD COLUMN IF NOT EXISTS prior_year_revenue numeric(14,2);

-- 2) Config global — A&B globais, repasses, créditos extra
ALTER TABLE public.event_simulator_config
  ADD COLUMN IF NOT EXISTS ab_drink_passthrough_pct numeric(5,2) NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS ab_food_passthrough_pct numeric(5,2) NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS souvenir_revenue numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS souvenir_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonif_bebidas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ponto_vendido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_tickets numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_drink numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_food numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_sponsor numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_souvenir numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_other numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_iva_pct numeric(5,2) NOT NULL DEFAULT 6;

-- 3) Linhas de custo do simulador
CREATE TABLE IF NOT EXISTS public.event_simulator_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  category_id uuid REFERENCES public.account_categories(id) ON DELETE SET NULL,
  label text NOT NULL,
  prior_year_amount numeric(14,2) NOT NULL DEFAULT 0,
  break_even_amount numeric(14,2) NOT NULL DEFAULT 0,
  forecast_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_ab_passthrough boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_cost_lines_event ON public.event_simulator_cost_lines(event_id);
CREATE INDEX IF NOT EXISTS idx_sim_cost_lines_company ON public.event_simulator_cost_lines(company_id);

ALTER TABLE public.event_simulator_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY sim_cost_lines_select_same_company
  ON public.event_simulator_cost_lines FOR SELECT
  TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY sim_cost_lines_write_staff
  ON public.event_simulator_cost_lines FOR ALL
  TO authenticated
  USING (
    company_id = current_company_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
    )
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
    )
  );

CREATE TRIGGER trg_sim_cost_lines_updated_at
  BEFORE UPDATE ON public.event_simulator_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

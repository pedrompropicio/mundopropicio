ALTER TABLE public.event_simulator_config
  ADD COLUMN IF NOT EXISTS default_merch_avg_ticket numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_merch_cmv_pct numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS default_merch_conversion_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsorship_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsorship_notes text,
  ADD COLUMN IF NOT EXISTS variable_spa_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_commission_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_curve_mode text DEFAULT 'preset'
    CHECK (sales_curve_mode IN ('preset','similar_events','prior_editions')),
  ADD COLUMN IF NOT EXISTS sales_curve_prior_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.event_simulator_zone_config
  ADD COLUMN IF NOT EXISTS merch_avg_ticket numeric,
  ADD COLUMN IF NOT EXISTS merch_cmv_pct numeric,
  ADD COLUMN IF NOT EXISTS merch_conversion_pct numeric;

CREATE TABLE IF NOT EXISTS public.event_simulator_sales_curve_buckets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  days_before integer NOT NULL,
  cumulative_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, days_before)
);

CREATE INDEX IF NOT EXISTS idx_sim_curve_event ON public.event_simulator_sales_curve_buckets(event_id);

ALTER TABLE public.event_simulator_sales_curve_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sim curve view"
  ON public.event_simulator_sales_curve_buckets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "Sim curve insert"
  ON public.event_simulator_sales_curve_buckets
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager')
      OR public.has_permission(auth.uid(),'forecast.write'))
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "Sim curve update"
  ON public.event_simulator_sales_curve_buckets
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager')
      OR public.has_permission(auth.uid(),'forecast.write'))
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "Sim curve delete"
  ON public.event_simulator_sales_curve_buckets
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager')
      OR public.has_permission(auth.uid(),'forecast.write'))
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE TRIGGER trg_sim_curve_updated_at
  BEFORE UPDATE ON public.event_simulator_sales_curve_buckets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.event_simulator_pax_benchmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('global','venue','city','artist')),
  scope_value text,
  category_code text NOT NULL CHECK (category_code IN ('1.1.02','1.1.03')),
  sample_size integer NOT NULL DEFAULT 0,
  avg_ticket_per_pax numeric NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, scope, scope_value, category_code)
);

CREATE INDEX IF NOT EXISTS idx_sim_bench_lookup
  ON public.event_simulator_pax_benchmarks(company_id, scope, category_code);

ALTER TABLE public.event_simulator_pax_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bench view tenant"
  ON public.event_simulator_pax_benchmarks
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_sim_bench_updated_at
  BEFORE UPDATE ON public.event_simulator_pax_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalculate_pax_benchmarks(_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  WITH agg AS (
    SELECT
      e.company_id,
      ac.code AS category_code,
      COUNT(DISTINCT e.id) AS sample_size,
      CASE WHEN SUM(e.tickets_sold) > 0
           THEN SUM(t.amount) / SUM(e.tickets_sold)
           ELSE 0 END AS avg_ticket
    FROM public.transactions t
    JOIN public.account_categories ac ON ac.id = t.category_id
    JOIN public.events e ON e.id = t.event_id
    WHERE t.type = 'income'
      AND t.status IN ('approved','paid')
      AND ac.code IN ('1.1.02','1.1.03')
      AND e.tickets_sold > 0
      AND (_company_id IS NULL OR e.company_id = _company_id)
    GROUP BY e.company_id, ac.code
    HAVING COUNT(DISTINCT e.id) >= 1
  )
  INSERT INTO public.event_simulator_pax_benchmarks
    (company_id, scope, scope_value, category_code, sample_size, avg_ticket_per_pax, last_calculated_at)
  SELECT company_id, 'global', NULL, category_code, sample_size, ROUND(avg_ticket::numeric, 2), now()
  FROM agg
  ON CONFLICT (company_id, scope, scope_value, category_code) DO UPDATE
    SET sample_size = EXCLUDED.sample_size,
        avg_ticket_per_pax = EXCLUDED.avg_ticket_per_pax,
        last_calculated_at = now();

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_pax_benchmarks(uuid) TO authenticated;
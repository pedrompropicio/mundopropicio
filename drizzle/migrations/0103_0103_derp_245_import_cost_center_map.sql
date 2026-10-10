-- D-ERP245 / #230: mapa explícito Centro Custo (normalizado) → rubrica, por empresa e fonte.
CREATE TABLE public.import_cost_center_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'coala',
  cost_center_raw text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.account_categories(id) ON DELETE RESTRICT,
  confirmed_by uuid NOT NULL DEFAULT auth.uid(),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_cost_center_map_norm CHECK (cost_center_raw = lower(btrim(cost_center_raw)) AND cost_center_raw <> ''),
  UNIQUE (company_id, source, cost_center_raw)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_cost_center_map TO authenticated;
GRANT ALL ON public.import_cost_center_map TO service_role;
ALTER TABLE public.import_cost_center_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_import_cost_center_map ON public.import_cost_center_map
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Cost center map readable by members" ON public.import_cost_center_map
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cost center map writable by admin/manager" ON public.import_cost_center_map
  FOR ALL TO authenticated
  USING (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role))
  WITH CHECK (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role));

-- Rubrica do mapa tem de ser da mesma empresa.
CREATE OR REPLACE FUNCTION public.validate_import_cost_center_map()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_categories c WHERE c.id = NEW.category_id AND c.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'A rubrica não pertence a esta empresa.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_import_cost_center_map() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validate_import_cost_center_map BEFORE INSERT OR UPDATE ON public.import_cost_center_map
  FOR EACH ROW EXECUTE FUNCTION public.validate_import_cost_center_map();
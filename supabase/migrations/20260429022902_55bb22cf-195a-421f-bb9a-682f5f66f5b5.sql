
-- =============================================================
-- FASE 2B — company_id em tabelas de bilhética
-- =============================================================

-- 1) Adicionar company_id
ALTER TABLE public.event_ticket_zones              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.event_ticket_lots               ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.event_ticket_office_assignments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.event_ticket_office_advances    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.ticket_office_settlements       ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.ticket_sales                    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.ticket_import_logs              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_event_ticket_zones_company              ON public.event_ticket_zones(company_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_lots_company               ON public.event_ticket_lots(company_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_office_assignments_company ON public.event_ticket_office_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_office_advances_company    ON public.event_ticket_office_advances(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_office_settlements_company       ON public.ticket_office_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_sales_company                    ON public.ticket_sales(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_import_logs_company              ON public.ticket_import_logs(company_id);

-- 3) Seed: Mundo Propício
DO $$
DECLARE v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mundo-propicio';
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Mundo Propício company not found'; END IF;

  UPDATE public.event_ticket_zones              SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_ticket_lots               SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_ticket_office_assignments SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_ticket_office_advances    SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.ticket_office_settlements       SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.ticket_sales                    SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.ticket_import_logs              SET company_id = v_company_id WHERE company_id IS NULL;
END $$;

-- 4) Policies RESTRICTIVE de isolamento por empresa
DROP POLICY IF EXISTS "company_isolation_event_ticket_zones" ON public.event_ticket_zones;
CREATE POLICY "company_isolation_event_ticket_zones" ON public.event_ticket_zones
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_event_ticket_lots" ON public.event_ticket_lots;
CREATE POLICY "company_isolation_event_ticket_lots" ON public.event_ticket_lots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_event_ticket_office_assignments" ON public.event_ticket_office_assignments;
CREATE POLICY "company_isolation_event_ticket_office_assignments" ON public.event_ticket_office_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_event_ticket_office_advances" ON public.event_ticket_office_advances;
CREATE POLICY "company_isolation_event_ticket_office_advances" ON public.event_ticket_office_advances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_ticket_office_settlements" ON public.ticket_office_settlements;
CREATE POLICY "company_isolation_ticket_office_settlements" ON public.ticket_office_settlements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_ticket_sales" ON public.ticket_sales;
CREATE POLICY "company_isolation_ticket_sales" ON public.ticket_sales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS "company_isolation_ticket_import_logs" ON public.ticket_import_logs;
CREATE POLICY "company_isolation_ticket_import_logs" ON public.ticket_import_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- 5) Trigger BEFORE INSERT para auto-preencher company_id
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'event_ticket_zones','event_ticket_lots','event_ticket_office_assignments',
    'event_ticket_office_advances','ticket_office_settlements','ticket_sales','ticket_import_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_company_id ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      v_table
    );
  END LOOP;
END $$;

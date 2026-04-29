-- Fase 2C: Multi-tenant para Cache de Artistas + Camarim (13 tabelas)

-- 1) Adicionar company_id nas tabelas
ALTER TABLE public.event_cache_configs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.event_cache_tiers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.event_cache_extras ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.event_cache_deductions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.event_cache_payments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.event_cache_city_settlements ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_sessions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_session_events ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_item_documents ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_item_reviews ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_fund_moves ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.camarim_integrations ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2) Índices de performance
CREATE INDEX IF NOT EXISTS idx_event_cache_configs_company ON public.event_cache_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_event_cache_tiers_company ON public.event_cache_tiers(company_id);
CREATE INDEX IF NOT EXISTS idx_event_cache_extras_company ON public.event_cache_extras(company_id);
CREATE INDEX IF NOT EXISTS idx_event_cache_deductions_company ON public.event_cache_deductions(company_id);
CREATE INDEX IF NOT EXISTS idx_event_cache_payments_company ON public.event_cache_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_event_cache_city_settlements_company ON public.event_cache_city_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_sessions_company ON public.camarim_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_session_events_company ON public.camarim_session_events(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_items_company ON public.camarim_items(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_item_documents_company ON public.camarim_item_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_item_reviews_company ON public.camarim_item_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_fund_moves_company ON public.camarim_fund_moves(company_id);
CREATE INDEX IF NOT EXISTS idx_camarim_integrations_company ON public.camarim_integrations(company_id);

-- 3) Seed dos registos existentes para "Mundo Propício"
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mundo-propicio' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa mundo-propicio não encontrada';
  END IF;

  UPDATE public.event_cache_configs SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_cache_tiers SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_cache_extras SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_cache_deductions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_cache_payments SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.event_cache_city_settlements SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_sessions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_session_events SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_items SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_item_documents SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_item_reviews SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_fund_moves SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.camarim_integrations SET company_id = v_company_id WHERE company_id IS NULL;
END $$;

-- 4) RLS RESTRICTIVE policies (filtro adicional por empresa)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'event_cache_configs','event_cache_tiers','event_cache_extras','event_cache_deductions',
    'event_cache_payments','event_cache_city_settlements',
    'camarim_sessions','camarim_session_events','camarim_items','camarim_item_documents',
    'camarim_item_reviews','camarim_fund_moves','camarim_integrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_%I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "company_isolation_%I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))',
      t, t
    );
  END LOOP;
END $$;

-- 5) Trigger BEFORE INSERT para auto-popular company_id
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'event_cache_configs','event_cache_tiers','event_cache_extras','event_cache_deductions',
    'event_cache_payments','event_cache_city_settlements',
    'camarim_sessions','camarim_session_events','camarim_items','camarim_item_documents',
    'camarim_item_reviews','camarim_fund_moves','camarim_integrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_company_id_trigger ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_company_id_trigger BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      t
    );
  END LOOP;
END $$;
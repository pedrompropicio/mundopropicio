
CREATE TABLE public.event_ab_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  fee_alimentos NUMERIC(12,2) NOT NULL DEFAULT 0,
  repasse_alimentos_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  per_capita_alimentos NUMERIC(10,2) NOT NULL DEFAULT 0,
  auto_sync_bp BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (repasse_alimentos_pct >= 0 AND repasse_alimentos_pct <= 100)
);

CREATE TABLE public.event_ab_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  zone_label TEXT NOT NULL,
  source_ticket_zone_id UUID REFERENCES public.event_ticket_zones(id) ON DELETE SET NULL,
  participants_manual INTEGER,
  open_bar BOOLEAN NOT NULL DEFAULT FALSE,
  per_capita_bebidas NUMERIC(10,2) NOT NULL DEFAULT 0,
  repasse_bebidas_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  open_food BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (repasse_bebidas_pct >= 0 AND repasse_bebidas_pct <= 100),
  UNIQUE (event_id, zone_label)
);

CREATE INDEX idx_event_ab_zones_event ON public.event_ab_zones(event_id);
CREATE INDEX idx_event_ab_config_company ON public.event_ab_config(company_id);
CREATE INDEX idx_event_ab_zones_company ON public.event_ab_zones(company_id);

CREATE OR REPLACE FUNCTION public.set_event_ab_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.events WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_ab_config_company
  BEFORE INSERT OR UPDATE ON public.event_ab_config
  FOR EACH ROW EXECUTE FUNCTION public.set_event_ab_company_id();

CREATE TRIGGER trg_event_ab_zones_company
  BEFORE INSERT OR UPDATE ON public.event_ab_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_event_ab_company_id();

CREATE TRIGGER trg_event_ab_config_updated
  BEFORE UPDATE ON public.event_ab_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_event_ab_zones_updated
  BEFORE UPDATE ON public.event_ab_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_ab_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ab_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ab_config_select_same_company"
  ON public.event_ab_config FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "ab_zones_select_same_company"
  ON public.event_ab_zones FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "ab_config_write_privileged"
  ON public.event_ab_config FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'editor')
      OR public.has_role(auth.uid(), 'platform_admin'))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'editor')
      OR public.has_role(auth.uid(), 'platform_admin'))
  );

CREATE POLICY "ab_zones_write_privileged"
  ON public.event_ab_zones FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'editor')
      OR public.has_role(auth.uid(), 'platform_admin'))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'editor')
      OR public.has_role(auth.uid(), 'platform_admin'))
  );

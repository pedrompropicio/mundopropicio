CREATE TABLE public.event_combo_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  benefits text,
  applies_to_days integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_combo_passes_event ON public.event_combo_passes(event_id);
CREATE INDEX idx_event_combo_passes_company ON public.event_combo_passes(company_id);

CREATE TABLE public.event_combo_pass_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_pass_id uuid NOT NULL REFERENCES public.event_combo_passes(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (combo_pass_id, zone_id)
);
CREATE INDEX idx_combo_pass_zones_combo ON public.event_combo_pass_zones(combo_pass_id);
CREATE INDEX idx_combo_pass_zones_zone ON public.event_combo_pass_zones(zone_id);

CREATE TABLE public.event_combo_pass_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_pass_id uuid NOT NULL REFERENCES public.event_combo_passes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  lot_number integer NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  iva_rate integer NOT NULL DEFAULT 6,
  lot_type text NOT NULL DEFAULT 'regular',
  version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_combo_pass_lots_combo ON public.event_combo_pass_lots(combo_pass_id);
CREATE INDEX idx_combo_pass_lots_company ON public.event_combo_pass_lots(company_id);

ALTER TABLE public.ticket_sales
  ADD COLUMN combo_pass_lot_id uuid REFERENCES public.event_combo_pass_lots(id) ON DELETE SET NULL;
CREATE INDEX idx_ticket_sales_combo_pass_lot ON public.ticket_sales(combo_pass_lot_id) WHERE combo_pass_lot_id IS NOT NULL;

CREATE TRIGGER trg_event_combo_passes_updated_at
  BEFORE UPDATE ON public.event_combo_passes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_combo_pass_lots_updated_at
  BEFORE UPDATE ON public.event_combo_pass_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_combo_pass_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.events WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_event_combo_passes_set_company
  BEFORE INSERT ON public.event_combo_passes
  FOR EACH ROW EXECUTE FUNCTION public.set_combo_pass_company_id();

CREATE OR REPLACE FUNCTION public.set_combo_pass_child_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.event_combo_passes WHERE id = NEW.combo_pass_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_event_combo_pass_lots_set_company
  BEFORE INSERT ON public.event_combo_pass_lots
  FOR EACH ROW EXECUTE FUNCTION public.set_combo_pass_child_company_id();
CREATE TRIGGER trg_event_combo_pass_zones_set_company
  BEFORE INSERT ON public.event_combo_pass_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_combo_pass_child_company_id();

ALTER TABLE public.event_combo_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_combo_pass_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_combo_pass_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_passes_select" ON public.event_combo_passes
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "combo_passes_write" ON public.event_combo_passes
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')))
  WITH CHECK (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')));

CREATE POLICY "combo_pass_zones_select" ON public.event_combo_pass_zones
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "combo_pass_zones_write" ON public.event_combo_pass_zones
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')))
  WITH CHECK (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')));

CREATE POLICY "combo_pass_lots_select" ON public.event_combo_pass_lots
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "combo_pass_lots_write" ON public.event_combo_pass_lots
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')))
  WITH CHECK (company_id = public.current_company_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')));
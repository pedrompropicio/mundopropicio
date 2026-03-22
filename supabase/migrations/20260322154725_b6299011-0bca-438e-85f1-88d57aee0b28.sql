
ALTER TABLE public.events ADD COLUMN partner_calc_basis text NOT NULL DEFAULT 'net_result';

CREATE TABLE public.event_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  percentage numeric NOT NULL DEFAULT 0,
  expense_includes_iva boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (event_id, supplier_id),
  CONSTRAINT percentage_range CHECK (percentage >= 0 AND percentage <= 100)
);

ALTER TABLE public.event_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event partners viewable by authenticated"
  ON public.event_partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Event partners insertable by authenticated"
  ON public.event_partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Event partners updatable by authenticated"
  ON public.event_partners FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Event partners deletable by admin or manager"
  ON public.event_partners FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_event_partners_updated_at
  BEFORE UPDATE ON public.event_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.check_partner_total_percentage()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE total numeric;
BEGIN
  SELECT COALESCE(SUM(percentage), 0) INTO total
  FROM public.event_partners
  WHERE event_id = NEW.event_id AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  total := total + NEW.percentage;
  IF total > 100 THEN
    RAISE EXCEPTION 'Total percentage exceeds 100: %', total;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_partner_percentage_trigger
  BEFORE INSERT OR UPDATE ON public.event_partners
  FOR EACH ROW EXECUTE FUNCTION check_partner_total_percentage();

CREATE TABLE public.event_cash_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE RESTRICT,
  from_event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  to_event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','equalized')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_cash_allocations_from_to_diff CHECK (from_event_id <> to_event_id)
);

CREATE INDEX idx_event_cash_allocations_company ON public.event_cash_allocations(company_id);
CREATE INDEX idx_event_cash_allocations_from ON public.event_cash_allocations(from_event_id) WHERE status='active';
CREATE INDEX idx_event_cash_allocations_to ON public.event_cash_allocations(to_event_id) WHERE status='active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_cash_allocations TO authenticated;
GRANT ALL ON public.event_cash_allocations TO service_role;

ALTER TABLE public.event_cash_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can insert event cash allocations"
  ON public.event_cash_allocations FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

CREATE POLICY "Admins/managers can update event cash allocations"
  ON public.event_cash_allocations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins/managers can delete event cash allocations"
  ON public.event_cash_allocations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Members can view event cash allocations"
  ON public.event_cash_allocations FOR SELECT TO authenticated
  USING (company_id = current_company_id() OR is_platform_admin());

CREATE POLICY "company_isolation_event_cash_allocations"
  ON public.event_cash_allocations AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id() OR is_platform_admin())
  WITH CHECK (company_id = current_company_id() OR is_platform_admin());

CREATE TRIGGER update_event_cash_allocations_updated_at
  BEFORE UPDATE ON public.event_cash_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
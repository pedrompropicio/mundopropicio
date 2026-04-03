
-- 1. Create ticket_offices table
CREATE TABLE public.ticket_offices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  notes text,
  financial_account_id uuid REFERENCES public.financial_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ticket offices viewable by authenticated"
  ON public.ticket_offices FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Ticket offices manageable by admin or manager"
  ON public.ticket_offices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_ticket_offices_updated_at
  BEFORE UPDATE ON public.ticket_offices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create event_ticket_office_assignments table
CREATE TABLE public.event_ticket_office_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_office_id uuid NOT NULL REFERENCES public.ticket_offices(id) ON DELETE CASCADE,
  event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL,
  commission_notes text,
  commission_type text NOT NULL DEFAULT 'descriptive',
  is_conciliated boolean NOT NULL DEFAULT false,
  conciliated_at timestamp with time zone,
  conciliated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (event_id, ticket_office_id, event_date_id)
);

ALTER TABLE public.event_ticket_office_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments viewable by authenticated"
  ON public.event_ticket_office_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Assignments manageable by admin or manager"
  ON public.event_ticket_office_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_event_ticket_office_assignments_updated_at
  BEFORE UPDATE ON public.event_ticket_office_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add ticket_office_id to ticket_sales
ALTER TABLE public.ticket_sales
  ADD COLUMN ticket_office_id uuid REFERENCES public.ticket_offices(id);

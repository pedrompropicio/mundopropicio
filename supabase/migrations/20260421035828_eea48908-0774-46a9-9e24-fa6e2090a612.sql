CREATE TABLE public.partner_advance_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_advance_expenses_event ON public.partner_advance_expenses(event_id);
CREATE INDEX idx_partner_advance_expenses_partner ON public.partner_advance_expenses(partner_id);

ALTER TABLE public.partner_advance_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner advance expenses viewable by authenticated"
ON public.partner_advance_expenses FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Partner advance expenses insertable by admin or manager"
ON public.partner_advance_expenses FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Partner advance expenses updatable by admin or manager"
ON public.partner_advance_expenses FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Partner advance expenses deletable by admin or manager"
ON public.partner_advance_expenses FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_partner_advance_expenses_updated_at
BEFORE UPDATE ON public.partner_advance_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
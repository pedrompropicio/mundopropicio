
-- Table to track expenses paid directly by event partners
CREATE TABLE public.partner_paid_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(transaction_id)
);

ALTER TABLE public.partner_paid_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view partner paid expenses"
  ON public.partner_paid_expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert partner paid expenses"
  ON public.partner_paid_expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Admins and managers can delete partner paid expenses"
  ON public.partner_paid_expenses FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

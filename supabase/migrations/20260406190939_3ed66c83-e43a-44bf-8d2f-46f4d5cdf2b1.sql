
CREATE TABLE public.event_closing_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  category_id UUID REFERENCES public.account_categories(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_closing_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closing costs viewable by authenticated"
  ON public.event_closing_costs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Closing costs insertable by privileged roles"
  ON public.event_closing_costs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Closing costs updatable by privileged roles"
  ON public.event_closing_costs FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Closing costs deletable by admin or manager"
  ON public.event_closing_costs FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_event_closing_costs_updated_at
  BEFORE UPDATE ON public.event_closing_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

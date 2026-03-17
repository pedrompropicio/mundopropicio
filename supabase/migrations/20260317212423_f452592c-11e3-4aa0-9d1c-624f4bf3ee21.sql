
CREATE TABLE public.event_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.account_categories(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  iva_rate INTEGER NOT NULL DEFAULT 23,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event forecasts viewable by authenticated"
  ON public.event_forecasts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Event forecasts manageable by authenticated"
  ON public.event_forecasts FOR ALL TO authenticated USING (true) WITH CHECK (true);

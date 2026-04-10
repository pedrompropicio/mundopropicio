-- Junction table: links BP forecast lines to responsible partners
CREATE TABLE public.event_forecast_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id UUID NOT NULL REFERENCES public.event_forecasts(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (forecast_id, partner_id)
);

-- Enable RLS
ALTER TABLE public.event_forecast_partners ENABLE ROW LEVEL SECURITY;

-- Viewable by authenticated
CREATE POLICY "Forecast partners viewable by authenticated"
ON public.event_forecast_partners FOR SELECT
TO authenticated USING (true);

-- Insertable by admin or manager
CREATE POLICY "Forecast partners insertable by admin or manager"
ON public.event_forecast_partners FOR INSERT
TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

-- Deletable by admin or manager
CREATE POLICY "Forecast partners deletable by admin or manager"
ON public.event_forecast_partners FOR DELETE
TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

-- Index for fast lookups
CREATE INDEX idx_forecast_partners_forecast ON public.event_forecast_partners(forecast_id);
CREATE INDEX idx_forecast_partners_partner ON public.event_forecast_partners(partner_id);
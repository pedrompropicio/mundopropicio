-- Add master_forecast_id to event_forecasts for BP consolidation
ALTER TABLE public.event_forecasts
ADD COLUMN master_forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX idx_event_forecasts_master_forecast_id ON public.event_forecasts(master_forecast_id) WHERE master_forecast_id IS NOT NULL;
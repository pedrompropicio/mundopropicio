
-- Add minimum guaranteed and finalized flag to cache configs
ALTER TABLE public.event_cache_configs
  ADD COLUMN minimum_guaranteed numeric NOT NULL DEFAULT 0,
  ADD COLUMN is_finalized boolean NOT NULL DEFAULT false;

-- Add cache_config_id to event_forecasts to link forecast lines to cache module
ALTER TABLE public.event_forecasts
  ADD COLUMN cache_config_id uuid REFERENCES public.event_cache_configs(id) ON DELETE SET NULL;

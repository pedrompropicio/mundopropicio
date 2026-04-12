-- Add exclude_from_result flag to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS exclude_from_result boolean NOT NULL DEFAULT false;

-- Add exclude_from_result flag to event_forecasts
ALTER TABLE public.event_forecasts
ADD COLUMN IF NOT EXISTS exclude_from_result boolean NOT NULL DEFAULT false;
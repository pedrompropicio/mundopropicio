
ALTER TABLE public.event_cache_configs
  ADD COLUMN real_amount numeric DEFAULT NULL,
  ADD COLUMN adjusted_amount numeric DEFAULT NULL,
  ADD COLUMN finalized_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN finalized_by text DEFAULT NULL;
